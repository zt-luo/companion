#!/usr/bin/python

import os
from time import sleep
home = os.environ['HOME'] 

while True:
  while (((os.system("ls /dev/serial/by-id/usb-3D_Robotics_PX4_FMU_v2.x_0-if00 2>/dev/null") != 0) and 
          (os.system("ls /dev/serial/by-id/usb-ArduPilot_Pixhawk1_200042000E51343032383731-if00 2>/dev/null") != 0)) or 
          (os.path.isfile(home+"/companion/scripts/start_mavproxy_telem_splitter.sh")==0)):
    sleep(2)

  os.system(home+"/companion/scripts/start_mavproxy_telem_splitter.sh")
  sleep(2)

