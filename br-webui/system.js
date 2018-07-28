
// SYSTEM PAGE

var os = require("os");
const child_process = require('child_process');

function getCpuStatus(callback) {
	var cmd = child_process.exec('vcgencmd get_throttled', function (error, stdout, stderr) {
		callback(stdout);
	});
}

module.exports = function (io) {
	return {

		updateCPUStats : function() {
			var cpu_stats = {};

			// report cpu usage stats (divide load by # of cpus to get load)
			cpu_stats.cpu_load	= os.loadavg()[0]/os.cpus().length*100;	 // %

			// report ram stats (raspbian uses 1024 B = 1 KB)
			cpu_stats.ram_free	= os.freemem()/(1024*1024);	 // MB
			cpu_stats.ram_total = os.totalmem()/(1024*1024); // MB
			cpu_stats.ram_used	= cpu_stats.ram_total - cpu_stats.ram_free; // MB

			cpu_stats.cpu_status    = ""
			// Get cpu status
			getCpuStatus(function(status) {
				throttled = status.split("=");

				// If command fail, return no status
				if (throttled[0] != "throttled") {
					cpu_stats.cpu_status = "No status"
					io.emit('cpu stats', cpu_stats);
					return;
				}

				// Decode command
				throttled_code = parseInt(throttled[1])
				var throttled_list =
				[
					{bit: 18, type: "Throttling has occurred"},
					{bit: 17, type: "Arm frequency capped has occurred"},
					{bit: 16, type: "Under-voltage has occurred"},
					{bit: 2, type: "Currently throttled"},
					{bit: 1, type: "Currently arm frequency capped"},
					{bit: 0, type: "Currently under-voltage"}
				];

				for (i = 0; i < throttled_list.length; i++) {
					if ((throttled_code >> throttled_list[i].bit) & 1) {
						if (cpu_stats.cpu_status != "") {
							cpu_stats.cpu_status += ", "
						}
						cpu_stats.cpu_status += throttled_list[i].type
					}
				}

				// stream collected data
				io.emit('cpu stats', cpu_stats);
			})
		},
		
		
		givemav: function () {
			var procstatus = {};
	
			var cmd = child_process.exec('screen -ls', function (error, stdout, stderr) {
				procstatus.mav = stdout.search("mavproxy") < 0 ? "Not Running" : "Running" ;
				procstatus.vid = stdout.search("video") < 0 ? "Not Running" : "Running" ;
				procstatus.webterm = stdout.search("webterminal") < 0 ? "Not Running" : "Running" ;
				procstatus.aud = stdout.search("audio") < 0 ? "Not Running" : "Running" ;
				procstatus.web = stdout.search("webui") < 0 ? "Not Running" : "Running" ;
				procstatus.filemanager = stdout.search("file-manager") < 0 ? "Not Running" : "Running" ;
				procstatus.router = stdout.search("commrouter") < 0 ? "Not Running" : "Running" ;
				procstatus.nmearx = stdout.search("nmearx") < 0 ? "Not Running" : "Running" ;
				procstatus.driver = stdout.search("wldriver") < 0 ? "Not Running" : "Running" ;
		
				for (var key in procstatus) {
					if (procstatus[key] == "Running") {
						procstatus[key] = procstatus[key].fontcolor("green");
					} else {
						procstatus[key] = procstatus[key].fontcolor("red");
					}
				}
				io.emit('getmav', procstatus);
			});
	
		},		
	}	
};
