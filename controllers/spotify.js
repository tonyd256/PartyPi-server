
var sp = require('libspotify');
var creds = require('../creds.js');
var events = require('events');
var speaker = require('speaker');
var request = require('request');
var async = require('async');
var child = require('child_process');

var mainPlaylist = [];
var currPlaylist = [];
var userPlaylist = [];
var imageCache = {};
var common;
var player;
var playing = false;
var cacheUnsaved = false;
var currentVolume = 0;
var currentTrack = null;
var isPaused = false;
var jukeboxEvent;
var dislikes = 0;

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

  isPaused = true;
  playNext(true);
});

playlistEvent.on('trackAdded', function () {
  if (session.isClosed() || currentTrack) return;
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
    currentTrack = null;
  }
  jukeboxEvent.emit('statusChange');
}

function loadTrack(meta, paused) {
  if (!meta.url.match(/spotify:track:\S+/i)) {
    console.log('uri: '+meta.url+' is not a spotify track uri');
    playNext();
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
    currentTrack = meta;
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
  if (imageCache[track.artist + '-' + track.album]) return cb(null, imageCache[track.artist + '' + track.album]);
  var defaultImage = { extralarge: '/images/backup_image.png' };

  request('http://ws.audioscrobbler.com/2.0/?method=album.getinfo&api_key=' + creds.lastfmApiKey + '&artist=' + track.artist + '&album=' + track.album + '&format=json', function (err, resp, body) {
    if (err) return cb(err, defaultImage);
    var json = JSON.parse(body);
    if (json.album && json.album.image) {
      var images = {};
      for (var i in json.album.image) {
        images[json.album.image[i].size] = json.album.image[i]['#text'];
      }
      imageCache[track.artist + '-' + track.album] = images;
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
        imageCache[track.artist + '-' + track.album] = images;
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

module.exports = function (commonLib, jEvent) {
  common = commonLib;
  jukeboxEvent = jEvent;

  this.search = function (query, cb) {
    if (session.isClosed()) return cb(new Error('Spotify session is closed'));

    var search = new sp.Search(query);
    search.execute();
    search.once('ready', function () {
      var tracks = [];
      for (var i in search.tracks)
        tracks.push(getTrackMeta(search.tracks[i]));

      cb(null, tracks);
    });
  };

  this.addTrack = function (url, cb) {
    if (session.isClosed()) return cb(new Error('Spotify session is closed'));
    if (!url) return cb(new Error('URL required'));
    if (!url.match(/spotify:track:\S+/i)) return cb(new Error('Not a valid Spotify track URL'));

    // check if already in playlist
    isTrackInPlaylist(url, function (isIn) {
      if (isIn) return cb();

      // add track url to main and user playlist
      var track = sp.Track.getFromUrl(url);
      track.once('ready', function () {
        var meta = getTrackMeta(track);
        // TODO: if already in the list, move up in position only
        mainPlaylist.push(meta);
        userPlaylist.push(meta);
        common.saveJSON('mainlist', mainPlaylist);
        common.saveJSON('userlist', userPlaylist);

        cb();
        playlistEvent.emit('trackAdded');
      });
    });
  };

  this.getTrack = function (url, cb) {
    if (session.isClosed()) return cb(new Error('Spotify session is closed'));
    if (!url) return cb(new Error('URL required'));
    if (!url.match(/spotify:track:\S+/i)) return cb(new Error('Not a valid Spotify track URL'));

    var track = sp.Track.getFromUrl(url);
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
          cb(null, meta);
        });
    });
  };

  this.pause = function (cb) {
    if (session.isClosed()) return cb(new Error('Spotify session is closed'));
    player.stop();
    isPaused = true;
    cb();
    jukeboxEvent.emit('statusChange');
  };

  this.play = function (cb) {
    if (session.isClosed()) return cb(new Error('Spotify session is closed'));

    // if nothing is playing but songs are in the playlist then play next song
    if (!currentTrack && mainPlaylist.length > 0) {
      playNext();
      return cb();
    }

    player.play();
    isPaused = false;
    cb();
    jukeboxEvent.emit('statusChange');
  };

  this.skip = function (cb) {
    if (session.isClosed()) return cb(new Error('Spotify session is closed'));
    player.stop();
    playNext();
    cb();
  };

  this.getPlaylists = function (cb) {
    if (session.isClosed()) return cb(new Error('Spotify session is closed'));
    session.getPlaylistcontainer().getPlaylists(function (playlists) {
      var list = [];
      for (var i in playlists)
        list.push({
          name: playlists[i].name,
          url: playlists[i].getUrl()
        });
      cb(null, list);
    });
  };

  this.getPlaylist = function (url, cb) {
    if (session.isClosed()) return cb(new Error('Spotify session is closed'));
    if (!url) return cb(new Error('URL required'));
    if (!url.match(/spotify:user:\S+:playlist:\S+/i)) return cb(new Error('Not a valid Spotify playlist URL'));

    var playlist = sp.Playlist.getFromUrl(url);
    playlist.getTracks( function (tracks) {
      var list = [];
      for (var i in tracks)
        list.push(getTrackMeta(tracks[i]));

      cb(null, {
        name: playlist.name,
        url: url,
        tracks: list
      });
    });
  };

  this.addPlaylist = function (url, cb) {
    if (session.isClosed()) return cb(new Error('Spotify session is closed'));
    if (!url) return cb(new Error('URL required'));
    if (!url.match(/spotify:user:\S+:playlist:\S+/i)) return cb(new Error('Not a valid Spotify playlist URL'));

    // add all tracks in playlist to currPlaylist and mainPlaylist
    var playlist = sp.Playlist.getFromUrl(url);
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

      cb();
      playlistEvent.emit('trackAdded');
    });
  };

  this.getCurrentPlaylist = function (cb) {
    if (session.isClosed()) return cb(new Error('Spotify session is closed'));
    cb(null, userPlaylist.concat(currPlaylist));
  };

  this.clearCurrentPlaylist = function (cb) {
    mainPlaylist = [];
    currPlaylist = [];
    userPlaylist = [];

    common.saveJSON('mainlist', mainPlaylist);
    common.saveJSON('userlist', userPlaylist);
    common.saveJSON('currentlist', currPlaylist);
    cb();
  };

  this.getStatus = function (cb) {
    cb(null, {
      volume: currentVolume,
      track: currentTrack,
      paused: isPaused
    });
  };

  this.dislike = function (cb) {
    if (++dislikes >= 5) {
      dislikes = 0;
      this.skip(cb);
    }
  };

  this.setVolume = function (vol, cb) {
    if (vol < 0 || vol > 100 || this.changingVolume) return;
    this.changingVolume = true;

    child.exec("sudo amixer set PCM -- "+vol+"%", function (err, stdout, stderr) {
      if (err) return next(err);
      if (stderr) return next(new Error(stderr));
      currentVolume = vol;
      cb();
      this.changingVolume = false;
      jukeboxEvent.emit('statusChange');
    });
  };

  if (!currentVolume)
    child.exec("amixer get PCM|grep -o [0-9]*%|sed 's/%//'", function (err, stdout, stderr) {
      currentVolume = parseInt(stdout, 10);
    });

  return this;
};
