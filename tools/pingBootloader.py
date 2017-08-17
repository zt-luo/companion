#!/usr/bin/python -u

# This is a python script that will flash new firmware to
# a Blue Robotics Ping1D acoustic rangefinder.

# The goto_bootloader message is sent to the Ping1D device,
# which will then enter the stm32 serial bootloader. The
# firmware is then loaded using the stm32flash tool from
# https://git.code.sf.net/p/stm32flash/code. When the upload
# is complete, execution of the new firmware begins.

# It is possible that the device is currently being used
# by the routing application that is installed with the
# Blue Robotics companion computer repository. In this case,
# we communicate with the routing application to remove the
# Ping1D device from the routing configuration, and restore
# the original configuration when we are done with the device.

from Ping import Ping
from Ping import Message
import platform
import argparse
import time
import os
import socket
import json
from argparse import ArgumentParser

os.system('printenv')
parser = ArgumentParser(description=__doc__)
parser.add_argument("-d", dest="device", required=True, help="Serial port of the device to flash")
parser.add_argument("-b", dest="baudrate", type=int, default=115200, help="Baudrate of Ping1D's current firmware")
parser.add_argument("-f", dest="file", required=True, help="Binary or hex file to flash")
parser.add_argument("-v", dest='verifyOption', action='store_true', help="Verify firmware after writing to device")
args = parser.parse_args()

supported_machines = ('x86_64', 'armv7l')
machine = platform.machine()
if machine not in supported_machines:
    print machine, 'cpu architecture is not supported'
    exit(1)

device = args.device

sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
sock.setblocking(False)

request = {'request': ''}

sock.sendto(json.dumps(request), ('0.0.0.0', 18990))
response = None
tstart = time.time()
while time.time() < tstart + 2:
    try:
        response, address = sock.recvfrom(1024)
        break
    except socket.error:
        #print 'socket error'
        pass
    time.sleep(0.5)

device_endpoint = None
if response is not None:
    configuration = json.loads(response)


    # Look for this device in existing routing endpoints
    # If we are currently routing this device, then the
    # serial interface is claimed. In this case, we first
    # remove the device endpoint from the configuration,
    # and restore the configuration when we are finished.
    
    device_endpoint = None
    
    for endpoint in configuration['endpoints']:
        if 'Ping1D-id-' in endpoint['id']:
            if device in endpoint['port']:
                print 'Device is endpoint, removing...'
                device_endpoint = endpoint
                
                # Send request to remove device from routing configuration.
                # This will close and free the port.
                
                request = {'request': 'remove endpoint',
                'id': device_endpoint['id']}
                
                sock.sendto(json.dumps(request), ('0.0.0.0', 18990))
                
                print 'sent request:', request

# Connect to Ping
myPing = Ping.Ping1D(device, args.baudrate)

# Make sure we have a Ping on the line
if myPing.initialize() is False:
    print 'Could not communicate with Ping device!'
    exit(1)

# Send it to the bootloader
myPing.sendMessage(Message.gen_goto_bootloader, [], 255)

options = ''

if args.verifyOption is True:
    options += '-v'

# Try five times, maybe not necessary
for x in range (0,5):
    time.sleep(0.5)
    cmd = '$COMPANION_DIR/tools/stm32flash_' + machine + ' ' + options + ' -g 0x0 -b 115200 -w ' + args.file + ' ' + args.device
    if os.system(cmd) == 0:
        break

time.sleep(0.1)

if device_endpoint is not None:
    print 'Restoring previous endpoint configuration...',
    
    # Restore routing configuration
    request = {'request': 'add endpoint',
               'id': device_endpoint['id'],
               'type': device_endpoint['type'],
               'port': device_endpoint['port'],
               'baudrate': device_endpoint['baudrate'],
               'connections': device_endpoint['connections']}
    
    sock.sendto(json.dumps(request), ('0.0.0.0', 18990))

    print 'Done'
