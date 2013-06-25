
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
  };

  this.getStatus = function (req, res, next) {
    res.send({ status: this.status() });
  };

  this.saveJSON = function (name, json) {
    fs.writeFileSync(__dirname + '/../data/'+name+'.json', JSON.stringify(json));
  };

  this.loadJSON = function (name) {
    return JSON.parse(fs.readFileSync(__dirname + '/../data/'+name+'.json', { encoding: 'utf8' }));
  };

  this.sendWithStatus = function (res, data) {
    if (data === null) return res.send({ status: status() });
    res.send({ status: this.status(), data: data });
  };

  return this;
};
