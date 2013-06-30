
var events = require('events');
var dgram = require('dgram');
var os = require('os');

var socket = dgram.createSocket('udp4');

var jukeboxEvent = new events.EventEmitter();
var creds = require('./creds.js');
var common = require('./routes/common');
var spotify = require('./routes/spotify')(common, jukeboxEvent);

socket.on('message', function (msg, rinfo) {
  console.log("socket got: " + msg + " from " + rinfo.address + ":" + rinfo.port);

  var json = JSON.parse(msg);
  if (json && json.cmd) {
    if (json.cmd == 'reportSelf')
      return sendData(json.cmd, { name: creds.name, ip: myIP }, rinfo.address);

    var fn = spotify[json.cmd];
    if (!fn) return console.log("Error: no function " + json.cmd);

    if (json.param)
      return fn(json.param, function (err, data) {
        if (err) return console.log(err);
        sendData(json.cmd, data, rinfo.address);
      });

    fn(function (err, data) {
      if (err) return console.log(err);
      sendData(json.cmd, data, rinfo.address);
    });
  }
});

function sendData(cmd, data, ip) {
  var msg = new Buffer(JSON.stringify({
    response: cmd,
    data: data
  }));

  socket.send(msg, 0, msg.length, 27071, ip, function (err) {
    if (err) console.log(err);
    console.log('Sent msg ' + msg + ' to ' + ip);
  });
}

jukeboxEvent.on('statusChange', function () {
  spotify.getStatus( function (err, data) {
    sendData('getStatus', data, '255.255.255.255');
  });
});

var myIP;
var ifaces = os.networkInterfaces();
for (var dev in ifaces) {
  var iface;
  if (ifaces['eth0']) iface = ifaces['eth0'];
  if (ifaces['en0']) iface = ifaces['en0'];
  if (ifaces['e0']) iface = ifaces['e0'];

  if (!iface) process.exit();
  iface.forEach( function (details){
    if (details.family == 'IPv4') {
      myIP = details.address;
    }
  });
}

socket.on('listening', function () {
  var address = socket.address();
  console.log('UDP Client listening on ' + address.address + ":" + address.port);
  socket.setBroadcast(true);
});

socket.bind(27072);
