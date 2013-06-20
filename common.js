
var fs = require('fs');

module.exports = function () {

  this.currentVolume = 0;
  this.currentTrack = null;
  this.isPaused = false;

  this.status = function () {
    return {
      volume: currentVolume,
      track: currentTrack,
      paused: isPaused
    };
  }

  this.getStatus = function (req, res, next) {
    res.send({ status: this.status() });
  };

  this.savePlaylist = function (name, playlist) {
    fs.writeFileSync('./data/'+name+'.json', JSON.stringify(playlist));
  };

  this.loadPlaylist = function (name, playlist) {
    return JSON.parse(fs.readFileSync('./data/'+name+'.json', { encoding: 'utf8' }));
  };

  this.sendWithStatus = function (res, data) {
    if (data === null) return res.send({ status: status() });
    res.send({ status: this.status(), data: data });
  };

  return this;
};
