#!/usr/bin/python -u

from Ping import Ping
import subprocess

try:
    try:
        output = subprocess.check_output(["rm", "-rf /dev/serial/by-id/Ping1D*"])
    except subprocess.CalledProcessError as e:
        print e

    output = subprocess.check_output("ls /dev/serial/by-id", shell=True)

    for line in output.split('\n'):
        if len(line) > 0:
            print "Looking for Ping at", "/dev/serial/by-id/" + line
            newPing = Ping.Ping1D("/dev/serial/by-id/" + line)
            if newPing.initialize() == True:
                try:
                    version_info = newPing.getVersion()

                    description = "/dev/serial/by-id/Ping1D-id-" + str(newPing.device_id) + '-t-' + str(version_info['device_type']) + '-m-' + str(version_info['device_model']) + '-v-' + str(version_info['fw_version_major']) + '.' + str(version_info['fw_version_minor'])
                    print "Found Ping1D (ID: %d) at %s" % (newPing.device_id, line)
                    target_device = subprocess.check_output("readlink -f /dev/serial/by-id/" + line, shell=True)
                    # Strip newline from output
                    target_device = target_device.split('\n')[0]
                    print "Creating symbolic link to", target_device
                    output = subprocess.check_output("ln -fs " + target_device + " " + description, shell=True)
                except subprocess.CalledProcessError as e:
                    print e
                    continue

except subprocess.CalledProcessError as e:
    print e
