
var sp = require('libspotify');
var creds = require('./creds.js');
var events = require('events');
var speaker = require('speaker');
var request = require('request');
var async = require('async');
var child = require('child_process');
var nStore = require('nstore');

var mainPlaylist = [];
var currPlaylist = [];
var userPlaylist = [];
var player;
var playing = false;
var cacheUnsaved = false;
var currentVolume = 0;
var currentTrack = null;
var isPaused = false;
var jukeboxEvent;
var dislikes = 0;
var db;

var speaker = new speaker();
var playlistEvent = new events.EventEmitter();

var session = new sp.Session({
  applicationKey: __dirname + '/spotify_appkey.key'
});

session.login(creds.username, creds.password);
session.once('login', function (err) {
  if (err) return console.log(err);
  player = session.getPlayer();
  player.on('track-end', playNext);

  // load in the playlists and pause setting
  db = nStore.new('./data/data.db', function () {
    async.parallel([
      function (cb) {
        db.get('mainPlaylist', function (err, doc, key) {
          if (err) { console.log(err); return cb(); }
          mainPlaylist = doc;
          cb();
        });
      },
      function (cb) {
        db.get('userPlaylist', function (err, doc, key) {
          if (err) { console.log(err); return cb(); }
          userPlaylist = doc;
          cb();
        });
      },
      function (cb) {
        db.get('currPlaylist', function (err, doc, key) {
          if (err) { console.log(err); return cb(); }
          currPlaylist = doc;
          cb();
        });
      },
      function (cb) {
        db.get('isPaused', function (err, doc, key) {
          if (err) { console.log(err); return cb(); }
          isPaused = doc;
          cb();
        });
      }
    ], function (err) {
      playNext();
    });
  });
});

playlistEvent.on('trackAdded', function () {
  if (session.isClosed() || currentTrack) return;
  playNext();
});

function playNext() {
  if (userPlaylist.length) {
    // play a track in the user added queue
    loadTrack(userPlaylist.splice(0, 1)[0]);
    if (db) db.save('userPlaylist', userPlaylist, function (err) { if (err) console.log(err); });
  } else if (currPlaylist.length) {
    // play a random track from the main queue
    loadTrack(currPlaylist.splice(0, 1)[0]);
    if (db) db.save('currPlaylist', currPlaylist, function (err) { if (err) console.log(err); });
  } else if (mainPlaylist.length) {
    // reload the main queue and play a random track
    var n = mainPlaylist.length;
    for (var i = 0; i < n; i++)
      currPlaylist.push(mainPlaylist[Math.floor(Math.random() * mainPlaylist.length)]);
    playNext();
  } else {
    // nothing to play so stop
    player.stop();
    currentTrack = null;
  }
}

function loadTrack(meta) {
  try {
    var track = sp.Track.getFromUrl(meta.url);
    track.once('ready', function () {
      player.load(track);

      if (!isPaused)
        player.play();

      if (!playing) {
        playing = true;
        player.pipe(speaker);
      }

      getAlbumArt(meta, function (err, images) {
        if (err) console.log(err);
        meta.images = images;
        currentTrack = meta;
        jukeboxEvent.emit('statusChange');
      });
    });
  } catch(err) {
    console.log(err);
    console.log(meta);
    return playNext();
  }
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

function checkImageCache(track, cb) {
  if (db) {
    db.get('image:' + track.artist + '-' + track.album, function (err, doc) {
      if (err) return cb(false);
      cb(true, doc);
    });
  } else {
    cb(false);
  }
}

function getAlbumArt(track, cb) {
  // fist check the cache
  checkImageCache(track, function (found, data) {
    if (found) return cb(data);

    // look for album image
    request('http://ws.audioscrobbler.com/2.0/?method=album.getinfo&api_key=' + creds.lastfmApiKey + '&artist=' + track.artist + '&album=' + track.album + '&format=json', function (err, resp, body) {
      if (err) return cb(err);
      var json = JSON.parse(body);
      if (json.album && json.album.image) {
        var images = {};
        for (var i in json.album.image) {
          images[json.album.image[i].size] = json.album.image[i]['#text'];
        }
        if (db) db.save('image:' + track.artist + '-' + track.album, images, function (err) { if (err) console.log(err); });
        return cb(null, images);
      }

      // look for artist image
      request('http://ws.audioscrobbler.com/2.0/?method=artist.getinfo&api_key=' + creds.lastfmApiKey + '&artist=' + track.artist + '&format=json', function (err, resp, body) {
        if (err) return cb(err);
        var json = JSON.parse(body);
        if (json.artist && json.artist.image) {
          var images = {};
          for (var i in json.album.image) {
            images[json.album.image[i].size] = json.album.image[i]['#text'];
          }
          if (db) db.save('image:' + track.artist + '-' + track.album, images, function (err) { if (err) console.log(err); });
          return cb(null, images);
        }

        cb("Couldn't find an image");
      });
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
        if (db) db.save('userPlaylist', userPlaylist, function (err) { if (err) console.log(err); });
        return cb(true);
      }

      cb(false);
    });
}

module.exports = function (jEvent) {
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

    // check if already in playlist
    isTrackInPlaylist(url, function (isIn) {
      if (isIn) return cb();

      // add track url to main and user playlist
      try {
        var track = sp.Track.getFromUrl(url);
        track.once('ready', function () {
          var meta = getTrackMeta(track);
          // TODO: if already in the list, move up in position only
          mainPlaylist.push(meta);
          userPlaylist.push(meta);
          if (db) {
            db.save('mainPlaylist', mainPlaylist, function (err) { if (err) console.log(err); });
            db.save('userPlaylist', userPlaylist, function (err) { if (err) console.log(err); });
          }

          cb();
          playlistEvent.emit('trackAdded');
        });
      } catch (err) {
        console.log(err);
        console.log(url);
        cb();
      }
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
    if (db) db.save('isPaused', isPaused, function (err) { if (err) console.log(err); });
    cb();
    jukeboxEvent.emit('statusChange');
  };

  this.play = function (cb) {
    if (session.isClosed()) return cb(new Error('Spotify session is closed'));

    isPaused = false;
    if (db) db.save('isPaused', isPaused, function (err) { if (err) console.log(err); });
    // if nothing is playing but songs are in the playlist then play next song
    if (!currentTrack && mainPlaylist.length > 0) {
      playNext();
      return cb();
    } else {
      jukeboxEvent.emit('statusChange');
    }

    player.play();
    cb();
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
      if (db) {
        db.save('mainPlaylist', mainPlaylist, function (err) { if (err) console.log(err); });
        db.save('currPlaylist', currPlaylist, function (err) { if (err) console.log(err); });
      }

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

    if (db) {
      db.remove('mainPlaylist', function (err) { if (err) console.log(err); });
      db.remove('userPlaylist', function (err) { if (err) console.log(err); });
      db.remove('currPlaylist', function (err) { if (err) console.log(err); });
    }
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
