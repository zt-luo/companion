
// ROUTING PAGE

const child_process = require('child_process');
var logger = require('tracer').console();
const dgram = require('dgram');

module.exports = function (io) {
	return {
		
		routingsocket: function() {
			io.on('connection', function(socket) {

				// used in routing setup
				socket.on('get serial ids', function(data) {
					logger.log("get serial ids");
					var cmd = child_process.exec('ls /dev/serial/by-id/*', function (error, stdout, stderr) {
						logger.log("ls /dev/serial/by-id/* : ", error + stdout + stderr);
						socket.emit('serial ids', stdout);
					});
				});


				// used in routing setup
				socket.on('routing request', function(data) {
					logger.log("routing request");
					var sock = dgram.createSocket('udp4');
					var message = new Buffer(JSON.stringify(data));
						sock.send(message, 0, message.length, 18990, '0.0.0.0', function(err, bytes) {
							if (err) {
								logger.error(err);
								throw err;
							}
						});
		
						sock.on('message', (msg, rinfo) => {
						socket.emit('endpoints', msg.toString());
					});

				});				
			});
		},
	}
};
