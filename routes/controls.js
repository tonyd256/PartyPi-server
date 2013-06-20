
var child = require('child_process');

module.exports = function (common) {
  this.volumeUp = function (req, res, next) {
    if (common.currentVolume === 100) return;

    child.exec("sudo amixer set PCM -- $[$(amixer get PCM|grep -o [0-9]*%|sed 's/%//')+5]%", function (err, stdout, stderr) {
      if (err) return next(err);
      if (stderr) return next(new Error(stderr));
      common.currentVolume += 5;
      res.send();
    });
  };

  this.volumeDown = function (req, res, next) {
    if (common.currentVolume === 0) return;

    child.exec("sudo amixer set PCM -- $[$(amixer get PCM|grep -o [0-9]*%|sed 's/%//')-5]%", function (err, stdout, stderr) {
      if (err) return next(err);
      if (stderr) return next(new Error(stderr));
      common.currentVolume -= 5;
      res.send();
    });
  };

  if (!common.currentVolume)
    child.exec("amixer get PCM|grep -o [0-9]*%|sed 's/%//'", function (err, stdout, stderr) {
      common.currentVolume = parseInt(stdout, 10);
    });

  return this;
};
