
/**
 * Module dependencies.
 */

var express = require('express');
var common = require('./routes/common')();
var spotify = require('./routes/spotify')(common);
var controls = require('./routes/controls')(common);
var web = require('./routes/web');
var http = require('http');
var path = require('path');

var app = express();

// all environments
app.set('port', process.env.PORT || 3000);
app.set('views', __dirname + '/views');
app.set('view engine', 'jade');
app.use(express.favicon());
app.use(express.logger('dev'));
app.use(express.bodyParser());
app.use(express.methodOverride());
app.use(express.static(path.join(__dirname, 'public')));
app.use(app.router);

// development only
if ('development' == app.get('env')) {
  app.use(express.errorHandler());
}

// error handler
app.use( function (err, req, res, next) {
  if (err instanceof Error) {
    console.log(err);
    res.send(500, { error: err.message });
  } else {
    console.log(err);
    res.send(500, { error: 'Unknown Error occured' });
  }
});

// views
app.get('*.html', web.renderHTML);

// api
app.get('/api/search', spotify.search);
app.get('/api/addtrack', spotify.addTrack);
app.get('/api/track', spotify.track);
app.get('/api/pause', spotify.pause);
app.get('/api/play', spotify.play);
app.get('/api/skip', spotify.skip);
app.get('/api/playlists', spotify.playlists);
app.get('/api/playlist', spotify.playlist);
app.get('/api/addplaylist', spotify.addPlaylist);
app.get('/api/volumeup', controls.volumeUp);
app.get('/api/volumedown', controls.volumeDown);
app.get('/api/volume', controls.setVolume);
// app.get('/api/mute', controls.mute);
// app.get('/api/unmute', controls.unmute);
app.get('/api/status', common.getStatus);
app.get('/api/currplaylist', spotify.currPlaylist);
app.get('/api/clear', spotify.clear);

app.get('*', web.index);

http.createServer(app).listen(app.get('port'), function(){
  console.log('Express server listening on port ' + app.get('port'));
});
