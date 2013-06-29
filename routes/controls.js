
var child = require('child_process');

module.exports = function (common) {
  this.volumeUp = function (req, res, next) {
    if (common.currentVolume === 100) return;

    var diff = 5;
    if (common.currentVolume+5 > 100) diff = 100 - common.currentVolume;

    child.exec("sudo amixer set PCM -- $[$(amixer get PCM|grep -o [0-9]*%|sed 's/%//')+"+diff+"]%", function (err, stdout, stderr) {
      if (err) return next(err);
      if (stderr) return next(new Error(stderr));
      common.currentVolume += 5;
      res.send();
    });
  };

  this.volumeDown = function (req, res, next) {
    if (common.currentVolume === 0) return;

    var diff = -5;
    if (common.currentVolume-5 < 0) diff = -common.currentVolume;

    child.exec("sudo amixer set PCM -- $[$(amixer get PCM|grep -o [0-9]*%|sed 's/%//')-"+diff+"]%", function (err, stdout, stderr) {
      if (err) return next(err);
      if (stderr) return next(new Error(stderr));
      common.currentVolume -= 5;
      res.send();
    });
  };

  return this;
};
