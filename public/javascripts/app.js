angular.module('app', ['Services']).
  config( function ($routeProvider, $locationProvider) {
    $locationProvider.html5Mode(true);
    $routeProvider.
      when('/', {
        controller: NowPlayingCtrl,
        templateUrl: 'nowplaying.html'
      }).
      when('/search', {
        controller: SearchCtrl,
        templateUrl: 'search.html'
      }).
      when('/playlists', {
        controller: PlaylistsCtrl,
        templateUrl: 'playlists.html'
      }).
      when('/playlist', {
        controller: PlaylistCtrl,
        templateUrl: 'playlist.html'
      }).
      when('/currplaylist', {
        controller: CurrentPlaylistCtrl,
        templateUrl: 'currplaylist.html'
      }).
      when('/track', {
        controller: TrackCtrl,
        templateUrl: 'track.html'
      }).
      otherwise({
        redirectTo: '/'
      });
  });
