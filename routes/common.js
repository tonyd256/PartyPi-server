
var fs = require('fs');

exports.saveJSON = function (name, json) {
  fs.writeFileSync(__dirname + '/../data/'+name+'.json', JSON.stringify(json));
};

exports.loadJSON = function (name) {
  return JSON.parse(fs.readFileSync(__dirname + '/../data/'+name+'.json', { encoding: 'utf8' }));
};
