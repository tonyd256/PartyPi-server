
var sp = require('libspotify');
var creds = require('../creds.js');
var events = require('events');
var speaker = require('speaker');
var request = require('request');
var async = require('async');

var mainPlaylist = [];
var currPlaylist = [];
var userPlaylist = [];
var imageCache = {};
var common;
var player;
var playing = false;
var cacheUnsaved = false;

var speaker = new speaker();
var playlistEvent = new events.EventEmitter();

var session = new sp.Session({
  applicationKey: __dirname + '/../../spotify_appkey.key'
});

session.login(creds.username, creds.password);
session.once('login', function (err) {
  if (err) return console.log(err);
  player = session.getPlayer();
  player.on('track-end', playNext);

  // load in the playlists
  mainPlaylist = common.loadJSON('mainlist');
  userPlaylist = common.loadJSON('userlist');
  currPlaylist = common.loadJSON('currentlist');

  common.isPaused = true;
  playNext(true);
});

playlistEvent.on('trackAdded', function () {
  if (session.isClosed() || common.currentTrack) return;
  playNext();
});

function playNext(paused) {
  if (userPlaylist.length) {
    // play a track in the user added queue
    loadTrack(userPlaylist.splice(0, 1)[0], paused);
    common.saveJSON('userlist', userPlaylist);
  } else if (currPlaylist.length) {
    // play a random track from the main queue
    loadTrack(currPlaylist.splice(0, 1)[0], paused);
    common.saveJSON('currentlist', currPlaylist);
  } else if (mainPlaylist.length) {
    // reload the main queue and play a random track
    var n = mainPlaylist.length;
    for (var i = 0; i < n; i++)
      currPlaylist.push(mainPlaylist[Math.floor(Math.random() * mainPlaylist.length)]);
    playNext(paused);
  } else {
    // nothing to play so stop
    player.stop();
    common.currentTrack = null;
  }
}

function loadTrack(meta, paused) {
  if (!meta.url.match(/spotify:track:\S+/i)) {
    console.log('uri is not a spotify track uri');
    player.stop();
    common.currentTrack = null;
    return;
  }

  var track = sp.Track.getFromUrl(meta.url);
  track.once('ready', function () {
    player.load(track);

    if (!paused)
      player.play();

    if (!playing) {
      playing = true;
      player.pipe(speaker);
    }
  });

  getAlbumArt(meta, function (err, images) {
    meta.images = images;
    common.currentTrack = meta;
  });
}

function getTrackMeta(track) {
  return {
    title: track.title,
    artist: track.artist.name,
    album: track.album.name,
    duration: track.humanDuration,
    url: track.getUrl()
  };
}

function getAlbumArt(track, cb) {
  if (imageCache[track.artist + '' + track.album]) return cb(null, imageCache[track.artist + '' + track.album]);
  var defaultImage = { extralarge: '/images/backup_image.png' };

  request('http://ws.audioscrobbler.com/2.0/?method=album.getinfo&api_key=' + creds.lastfmApiKey + '&artist=' + track.artist + '&album=' + track.album + '&format=json', function (err, resp, body) {
    if (err) return cb(err, defaultImage);
    var json = JSON.parse(body);
    if (json.album && json.album.image) {
      var images = {};
      for (var i in json.album.image) {
        images[json.album.image[i].size] = json.album.image[i]['#text'];
      }
      imageCache[track.artist + '' + track.album] = images;
      cacheUnsaved = true;
      return cb(null, images);
    }

    request('http://ws.audioscrobbler.com/2.0/?method=artist.getinfo&api_key=' + creds.lastfmApiKey + '&artist=' + track.artist + '&format=json', function (err, resp, body) {
      if (err) return cb(err, defaultImage);
      var json = JSON.parse(body);
      if (json.artist && json.artist.image) {
        var images = {};
        for (var i in json.album.image) {
          images[json.album.image[i].size] = json.album.image[i]['#text'];
        }
        imageCache[track.artist + '' + track.album] = images;
        cacheUnsaved = true;
        return cb(null, images);
      }

      cb(null, defaultImage);
    });
  });
}

function isTrackInPlaylist(url, cb) {
  async.parallel({
    main: function (callback) {
      async.detect(mainPlaylist, function (item, cb) {
        cb(item.url === url);
      }, function (result) {
        if (result) return callback(null, result);
        callback();
      });
    },
    curr: function (callback) {
      async.detect(currPlaylist, function (item, cb) {
        cb(item.url === url);
      }, function (result) {
        if (result) return callback(null, result);
        callback();
      });
    },
    user: function (callback) {
      async.detect(userPlaylist, function (item, cb) {
        cb(item.url === url);
      }, function (result) {
        if (result) return callback(null, result);
        callback();
      });
    }},
    function (err, results) {
      if (results.user || results.curr) return cb(true);
      if (results.main) {
        userPlaylist.push(results.main);
        common.saveJSON('userlist', userPlaylist);
        return cb(true);
      }

      cb(false);
    });
}

module.exports = function (commonLib) {
  common = commonLib;

  this.search = function (req, res, next) {
    if (session.isClosed()) return next(new Error('Spotify session is closed'));

    var search = new sp.Search(req.query.query);
    search.execute();
    search.once('ready', function () {
      var tracks = [];
      for (var i in search.tracks)
        tracks.push(getTrackMeta(search.tracks[i]));

      common.sendWithStatus(res, tracks);
    });
  };

  this.addTrack = function (req, res, next) {
    if (session.isClosed()) return next(new Error('Spotify session is closed'));
    if (!req.query.url) return next(new Error('URL required'));
    if (!req.query.url.match(/spotify:track:\S+/i)) return next(new Error('Not a valid Spotify track URL'));

    // check if already in playlist
    isTrackInPlaylist(req.query.url, function (isIn) {
      if (isIn) return common.sendWithStatus(res, null);

      // add track url to main and user playlist
      var track = sp.Track.getFromUrl(req.query.url);
      track.once('ready', function () {
        var meta = getTrackMeta(track);
        // TODO: if already in the list, move up in position only
        mainPlaylist.push(meta);
        userPlaylist.push(meta);
        common.saveJSON('mainlist', mainPlaylist);
        common.saveJSON('userlist', userPlaylist);

        common.sendWithStatus(res, null);
        playlistEvent.emit('trackAdded');
      });
    });
  };

  this.track = function (req, res, next) {
    if (session.isClosed()) return next(new Error('Spotify session is closed'));
    if (!req.query.url) return next(new Error('URL required'));
    if (!req.query.url.match(/spotify:track:\S+/i)) return next(new Error('Not a valid Spotify track URL'));

    var track = sp.Track.getFromUrl(req.query.url);
    track.once('ready', function () {
      var meta = getTrackMeta(track);

      // get album art and see if its alread in playlist in parallel
      async.parallel([
        function (callback) {
          getAlbumArt(meta, function (err, images) {
            if (err) return callback(err);
            meta.images = images;
            callback();
          });
        },
        function (callback) {
          async.detect(mainPlaylist, function (item, cb) {
            cb(item.url === meta.url);
          }, function (result) {
            if (result) meta.inPlaylist = true;
            else meta.inPlaylist = false;
            callback();
          });
        }], function (err) {
          if (err) return next(err);
          common.sendWithStatus(res, meta);
        });
    });
  };

  this.pause = function (req, res, next) {
    if (session.isClosed()) return next(new Error('Spotify session is closed'));
    player.stop();
    common.isPaused = true;
    common.sendWithStatus(res, null);
  };

  this.play = function (req, res, next) {
    if (session.isClosed()) return next(new Error('Spotify session is closed'));

    // if nothing is playing but songs are in the playlist then play next song
    if (!common.currentTrack && mainPlaylist.length > 0) {
      playNext();
      return common.sendWithStatus(res, null);
    }

    player.play();
    common.isPaused = false;
    common.sendWithStatus(res, null);
  };

  this.skip = function (req, res, next) {
    if (session.isClosed()) return next(new Error('Spotify session is closed'));
    player.stop();
    playNext();
    common.sendWithStatus(res, null);
  };

  this.playlists = function (req, res, next) {
    if (session.isClosed()) return next(new Error('Spotify session is closed'));
    session.getPlaylistcontainer().getPlaylists(function (playlists) {
      var list = [];
      for (var i in playlists)
        list.push({
          name: playlists[i].name,
          url: playlists[i].getUrl()
        });
      common.sendWithStatus(res, list);
    });
  };

  this.playlist = function (req, res, next) {
    if (session.isClosed()) return next(new Error('Spotify session is closed'));
    if (!req.query.url) return next(new Error('URL required'));
    if (!req.query.url.match(/spotify:user:\S+:playlist:\S+/i)) return next(new Error('Not a valid Spotify playlist URL'));

    var playlist = sp.Playlist.getFromUrl(req.query.url);
    playlist.getTracks( function (tracks) {
      var list = [];
      for (var i in tracks)
        list.push(getTrackMeta(tracks[i]));

      common.sendWithStatus(res, {
        name: playlist.name,
        url: req.query.url,
        tracks: list
      });
    });
  };

  this.addPlaylist = function (req, res, next) {
    if (session.isClosed()) return next(new Error('Spotify session is closed'));
    if (!req.query.url) return next(new Error('URL required'));
    if (!req.query.url.match(/spotify:user:\S+:playlist:\S+/i)) return next(new Error('Not a valid Spotify playlist URL'));

    // add all tracks in playlist to currPlaylist and mainPlaylist
    var playlist = sp.Playlist.getFromUrl(req.query.url);
    playlist.getTracks( function (tracks) {
      for (var i in tracks) {
        var meta = getTrackMeta(tracks[i]);
        isTrackInPlaylist(meta.url, function (isIn) {
          if (isIn) return;
          mainPlaylist.push(meta);
          currPlaylist.push(meta);
        });
      }

      common.saveJSON('mainlist', mainPlaylist);
      common.saveJSON('currentlist', currPlaylist);

      common.sendWithStatus(res, null);
      playlistEvent.emit('trackAdded');
    });
  };

  this.currPlaylist = function (req, res, next) {
    if (session.isClosed()) return next(new Error('Spotify session is closed'));
    common.sendWithStatus(res, { tracks: userPlaylist.concat(currPlaylist) });
  };

  this.clear = function (req, res, next) {
    mainPlaylist = [];
    currPlaylist = [];
    userPlaylist = [];

    common.saveJSON('mainlist', mainPlaylist);
    common.saveJSON('userlist', userPlaylist);
    common.saveJSON('currentlist', currPlaylist);
    common.sendWithStatus(res, null);
  };

  return this;
};
