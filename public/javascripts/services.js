angular.module('Services', ['ngResource']).
  factory('Playlists', function ($resource) {
    return $resource('/api/playlists');
  }).
  factory('Playlist', function ($resource) {
    return $resource('/api/playlist');
  }).
  factory('CurrentPlaylist', function ($resource) {
    return $resource('/api/currplaylist');
  }).
  factory('Clear', function ($resource) {
    return $resource('/api/clear');
  }).
  factory('Track', function ($resource) {
    return $resource('/api/track');
  }).
  factory('Search', function ($resource) {
    return $resource('/api/search');
  }).
  factory('Status', function ($resource) {
    return $resource('/api/status');
  }).
  factory('AddTrack', function ($resource) {
    return $resource('/api/addtrack');
  }).
  factory('AddPlaylist', function ($resource) {
    return $resource('/api/addplaylist');
  }).
  factory('Pause', function ($resource) {
    return $resource('/api/pause');
  }).
  factory('Play', function ($resource) {
    return $resource('/api/play');
  }).
  factory('Skip', function ($resource) {
    return $resource('/api/skip');
  }).
  factory('Volume', function ($resource) {
    return $resource('/api/volume');
  });
