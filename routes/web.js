
/*
 * GET home page.
 */

exports.index = function (req, res) {
  res.render('index');
};

exports.renderHTML = function (req, res) {
  res.render(req.url.match(/.*\/(.+)\.html$/i)[1]);
};