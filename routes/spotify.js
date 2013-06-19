
var sp = require('libspotify');
var creds = require('../creds.js');
var events = require('events');
var speaker = require('speaker');

var mainPlaylist = [];
var currPlaylist = [];
var userPlaylist = [];
var currTrack;
var player;
var playing = false;
var paused = false;

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
});

playlistEvent.on('trackAdded', function () {
  if (session.isClosed() || currTrack) return;
  playNext();
});

function playNext() {
  if (userPlaylist.length) {
    // play a track in the user added queue
    loadTrack(userPlaylist[0]);
    userPlaylist.splice(0, 1);
  } else if (currPlaylist.length) {
    // play a random track from the main queue
    loadTrack(currPlaylist[Math.floor(Math.random() * currPlaylist.length)]);
    currPlaylist.splice(0, 1);
  } else if (mainPlaylist.length) {
    // reload the main queue and play a random track
    for (var index in mainPlaylist)
      currPlaylist.push(mainPlaylist[index]);
    loadTrack(currPlaylist[Math.floor(Math.random() * currPlaylist.length)]);
    currPlaylist.splice(0, 1);
  } else {
    // nothing to play so stop
    player.stop();
    currTrack = null;
  }
}

function loadTrack(meta) {
  if (!meta.url.match(/spotify:track:\S+/i)) {
    console.log('uri is not a spotify track uri');
    player.stop();
    currTrack = null;
    return;
  }

  var track = sp.Track.getFromUrl(meta.url);
  track.once('ready', function () {
    player.load(track);
    player.play();

    if (!playing) {
      console.log('activate player');
      playing = true;
      player.pipe(speaker);
    }
  });
  currTrack = meta;
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

exports.search = function (req, res, next) {
  if (session.isClosed()) return next(new Error('Spotify session is closed'));

  var search = new sp.Search(req.query.query);
  search.execute();
  search.once('ready', function () {
    console.log(search.tracks[0].getUrl());
    var tracks = [];
    for (var i in search.tracks)
      tracks.push(getTrackMeta(search.tracks[i]));

    res.send({ data: tracks });
  });
};

exports.addTrack = function (req, res, next) {
  if (!req.query.url) return next(new Error('URL required'));
  if (!req.query.url.match(/spotify:track:\S+/i)) return next(new Error('Not a valid Spotify track URL'));

  // add track url to main and user playlist
  var track = sp.Track.getFromUrl(req.query.url);
  track.once('ready', function () {
    var meta = getTrackMeta(track);
    mainPlaylist.push(meta);
    userPlaylist.push(meta);
    res.send();
    playlistEvent.emit('trackAdded');
  });
};

exports.pause = function (req, res, next) {
  if (session.isClosed()) return next(new Error('Spotify session is closed'));
  player.stop();
  paused = true;
};

exports.play = function (req, res, next) {
  if (session.isClosed()) return next(new Error('Spotify session is closed'));
  player.play();
  paused = false;
};

exports.skip = function (req, res, next) {
  if (session.isClosed()) return next(new Error('Spotify session is closed'));
  player.stop();
  playNext();
};

exports.playlists = function (req, res, next) {
  if (session.isClosed()) return next(new Error('Spotify session is closed'));
  session.getPlaylistcontainer().getPlaylists(function (playlists) {
    var list = [];
    for (var i in playlists)
      list.push({
        name: playlists[i].name,
        url: playlists[i].getUrl()
      });
    res.send({ data: list });
  });
};

exports.playlist = function (req, res, next) {
  if (session.isClosed()) return next(new Error('Spotify session is closed'));
  if (!req.query.url) return next(new Error('URL required'));
  if (!req.query.url.match(/spotify:user:\S+:playlist:\S+/i)) return next(new Error('Not a valid Spotify playlist URL'));

  var playlist = sp.Playlist.getFromUrl(req.query.url);
  playlist.getTracks( function (tracks) {
    var list = [];
    for (var i in tracks)
      list.push(getTrackMeta(tracks[i]));

    res.send({ data: {
      name: playlist.name,
      url: req.query.url,
      tracks: list
    }});
  });
};

exports.addPlaylist = function (req, res, next) {
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
    res.send();
    playlistEvent.emit('trackAdded');
  });
};

exports.currTrack = function (req, res, next) {
  if (session.isClosed()) return next(new Error('Spotify session is closed'));
  if (!currTrack) return res.send({ data: {} });
  var track = currTrack;
  track.paused = paused;
  res.send({ data: track });
};

exports.userPlaylist = function (req, res, next) {
  if (session.isClosed()) return next(new Error('Spotify session is closed'));
  res.send({ data: userPlaylist });
};

exports.mainPlaylist = function (req, res, next) {
  if (session.isClosed()) return next(new Error('Spotify session is closed'));
  res.send({ data: mainPlaylist });
};
