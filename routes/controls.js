
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

  this.setVolume = function (req, res, next) {
    if (req.query.vol < 0 || req.query.vol > 100) return;

    child.exec("sudo amixer set PCM -- "+req.query.vol+"%", function (err, stdout, stderr) {
      if (err) return next(err);
      if (stderr) return next(new Error(stderr));
      common.currentVolume = req.query.vol;
      res.send();
    });
  };

  if (!common.currentVolume)
    child.exec("amixer get PCM|grep -o [0-9]*%|sed 's/%//'", function (err, stdout, stderr) {
      common.currentVolume = parseInt(stdout, 10);
    });

  return this;
};
