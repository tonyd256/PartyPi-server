function NowPlayingCtrl($scope, Status, $timeout, Pause, Play, Skip, Volume) {
  $scope.like = function () {
    console.log('like');
  };

  $scope.dislike = function () {
    console.log('dislike');
  };

  $scope.pause = function () {
    if (!$scope.status.status.paused) {
      Pause.get();
      $scope.status.status.paused = true;
    } else {
      Play.get();
      $scope.status.status.paused = false;
    }
  };

  $scope.skip = function () {
    Skip.get();
  };

  $scope.refresh = function () {
    var status =  Status.get( function () {
      if ($scope.status !== status)
        $scope.status = status;
      $timeout($scope.refresh, 3000);
    });
  };

  $scope.volume = function () {
    Volume.get({ vol: $scope.volRange });
  };

  $scope.refresh();
}

function SearchCtrl($scope, $location, Search, Track) {
  if (Search.lastquery) $scope.searchbox = Search.lastquery;
  if (Search.results) $scope.results = Search.results;

  $scope.search = function () {
    Search.lastquery = $scope.searchbox;
    if ($scope.searchbox.length > 1)
      $scope.results = Search.get({ query: $scope.searchbox });
  };

  $scope.viewTrack = function (track) {
    Search.lastquery = $scope.searchbox;
    Search.results = $scope.results;
    Track.url = track.url;
    $location.path('/track');
  };
}

function PlaylistsCtrl($scope, $location, Playlists, Playlist) {
  $scope.playlists = Playlists.get();

  $scope.viewPlaylist = function (playlist) {
    Playlist.url = playlist.url;
    $location.path('/playlist');
  };
}

function PlaylistCtrl($scope, $location, Playlist, Track, AddPlaylist) {
  $scope.playlist = Playlist.get({ url: Playlist.url });

  $scope.viewTrack = function (track) {
    Track.url = track.url;
    $location.path('/track');
  };

  $scope.addAll = function () {
    AddPlaylist.get({ url: $scope.playlist.data.url }, function () {
      alert('Success!');
    });
  };
}

function CurrentPlaylistCtrl($scope, $location, CurrentPlaylist, Track, Clear) {
  $scope.playlist = CurrentPlaylist.get();
  $scope.clearEnabled = true;

  $scope.viewTrack = function (track) {
    Track.url = track.url;
    Track.cantAdd = true;
    $location.path('/track');
  };

  $scope.clear = function () {
    Clear.get();
    $scope.playlist.data.tracks = [];
  };
}

function TrackCtrl($scope, Track, AddTrack) {
  $scope.track = Track.get({ url: Track.url });
  $scope.cantAdd = Track.cantAdd || false;

  $scope.add = function () {
    AddTrack.get({ url: $scope.track.data.url });
    $scope.cantAdd = true;
  };
}
