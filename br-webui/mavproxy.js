
// MAVRPOXY PAGE

var home_dir = process.env.HOME
var _companion_directory = process.env.COMPANION_DIR;
const child_process = require('child_process');
var logger = require('tracer').console();
var fs = require("fs");

module.exports = function (io) {
	return {
		mavsocket: function() {
			io.on('connection', function(socket) {
				
				socket.on('save params', function(data) {
					var file_path = home_dir+"/" + data.file
					fs.writeFile(file_path, data.params, function(err) {
						if(err) {
							logger.log(err);
							return;
						}
						socket.emit('save params response', {'file':data.file});
						logger.log("The file was saved!");
					});
				});

				socket.on('load params', function(data) {
					var user_file_path    = home_dir+"/" + data.file;
					var default_file_path = _companion_directory + "/params/" +  data.file + ".default";
					// Check if the user param file exists, use default file if it doesn't
					fs.stat(user_file_path, function(err, stat) {
						var file_path = (err == null) ? user_file_path : default_file_path;
						fs.readFile(file_path, function(err, param_data) {
							if(err) {
								logger.log(err);
								return;
							}

							socket.emit('load params response', {
								'params':param_data.toString(),
								'file':data.file
							});
							logger.log("The file was loaded!");
						});
					});	
				});
	
				socket.on('delete params', function(data) {
					var user_file_path    = home_dir+"/" + data.file;
					// Check if the user param file exists, delete it if it does
					fs.stat(user_file_path, function(err, stat) {
						if (err == null) {
							fs.unlink(user_file_path, function(err, param_data) {
								if(err) {
									logger.log(err);
									return;
								}
								socket.emit('delete params response', {'file':data.file});
								logger.log("The param file was deleted");
							});
						}		
					});
				});

				socket.on('restart mavproxy', function(data) {
					logger.log(_companion_directory + '/scripts/restart-mavproxy.sh');
					var cmd = child_process.spawn(_companion_directory + '/scripts/restart-mavproxy.sh', {
						detached: true
					});

					cmd.unref();

					cmd.stdout.on('data', function (data) {
						logger.log(data.toString());
					});

					cmd.stderr.on('data', function (data) {
						logger.log(data.toString());
					});

					cmd.on('exit', function (code) {
						logger.log('mavproxy restart exited with code ' + code.toString());
					});

					cmd.on('error', (err) => {
						logger.log('Failed to start child process.');
						logger.log(err.toString());
					});	
				});

				
			});		
		},
	}
};
