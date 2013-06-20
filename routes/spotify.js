
var sp = require('libspotify');
var creds = require('../creds.js');
var events = require('events');
var speaker = require('speaker');

var mainPlaylist = [];
var currPlaylist = [];
var userPlaylist = [];
var common;
var player;
var playing = false;

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
  mainPlaylist = common.loadPlaylist('mainlist');
  userPlaylist = common.loadPlaylist('userlist');
  currPlaylist = common.loadPlaylist('currentlist');
});

playlistEvent.on('trackAdded', function () {
  if (session.isClosed() || common.currentTrack) return;
  playNext();
});

function playNext() {
  if (userPlaylist.length) {
    // play a track in the user added queue
    loadTrack(userPlaylist.splice(0, 1)[0]);
    common.savePlaylist('userlist', userPlaylist);
  } else if (currPlaylist.length) {
    // play a random track from the main queue
    loadTrack(currPlaylist.splice(0, 1)[0]);
    common.savePlaylist('currentlist', currPlaylist);
  } else if (mainPlaylist.length) {
    // reload the main queue and play a random track
    var n = mainPlaylist.length;
    for (var i = 0; i < n; i++)
      currPlaylist.push(mainPlaylist[Math.floor(Math.random() * mainPlaylist.length)]);
    playNext();
  } else {
    // nothing to play so stop
    player.stop();
    common.currentTrack = null;
  }
}

function loadTrack(meta) {
  if (!meta.url.match(/spotify:track:\S+/i)) {
    console.log('uri is not a spotify track uri');
    player.stop();
    common.currentTrack = null;
    return;
  }

  var track = sp.Track.getFromUrl(meta.url);
  track.once('ready', function () {
    player.load(track);
    player.play();

    if (!playing) {
      playing = true;
      player.pipe(speaker);
    }
  });
  common.currentTrack = meta;
}

function getTrackMeta(track) {
  return {
    title: track.title,
    author: track.author,
    album: track.album,
    duration: track.humanDuration,
    url: track.getUrl()
  };
}

module.exports = function (commonLib) {
  common = commonLib;

  this.search = function (req, res, next) {
    if (session.isClosed()) return next(new Error('Spotify session is closed'));

    var search = new sp.Search(req.query.query);
    search.execute();
    search.once('ready', function () {
      console.log(search.tracks[0].getUrl());
      var tracks = [];
      for (var i in search.tracks)
        tracks.push(getTrackMeta(search.tracks[i]));

      common.sendWithStatus(res, tracks);
    });
  };

  this.addTrack = function (req, res, next) {
    if (!req.query.url) return next(new Error('URL required'));
    if (!req.query.url.match(/spotify:track:\S+/i)) return next(new Error('Not a valid Spotify track URL'));

    // add track url to main and user playlist
    var track = sp.Track.getFromUrl(req.query.url);
    track.once('ready', function () {
      var meta = getTrackMeta(track);
      mainPlaylist.push(meta);
      userPlaylist.push(meta);
      common.savePlaylist('mainlist', mainPlaylist);
      common.savePlaylist('userPlaylist', userPlaylist);

      common.sendWithStatus(res, null);
      playlistEvent.emit('trackAdded');
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
        mainPlaylist.push(meta);
        currPlaylist.push(meta);
      }
      common.savePlaylist('mainlist', mainPlaylist);
      common.savePlaylist('currentlist', currPlaylist);

      common.sendWithStatus(res, null);
      playlistEvent.emit('trackAdded');
    });
  };

  this.userPlaylist = function (req, res, next) {
    if (session.isClosed()) return next(new Error('Spotify session is closed'));
    common.sendWithStatus(res, userPlaylist);
  };

  this.mainPlaylist = function (req, res, next) {
    if (session.isClosed()) return next(new Error('Spotify session is closed'));
    common.sendWithStatus(res, mainPlaylist);
  };

  return this;
};
