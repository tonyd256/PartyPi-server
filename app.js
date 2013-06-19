
/**
 * Module dependencies.
 */

var express = require('express');
var routes = require('./routes');
var spotify = require('./routes/spotify');
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
app.use(app.router);
app.use(require('less-middleware')({ src: __dirname + '/public' }));
app.use(express.static(path.join(__dirname, 'public')));

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

//app.get('/', routes.index);
app.get('/search', spotify.search);
app.get('/addtrack', spotify.addTrack);
app.get('/pause', spotify.pause);
app.get('/play', spotify.play);
app.get('/skip', spotify.skip);
app.get('/currtrack', spotify.currTrack);
app.get('/playlists', spotify.playlists);
app.get('/playlists', spotify.playlists);
app.get('/playlist', spotify.playlist);
app.get('/addplaylist', spotify.addPlaylist);

http.createServer(app).listen(app.get('port'), function(){
  console.log('Express server listening on port ' + app.get('port'));
});
