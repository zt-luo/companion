#!/bin/bash

#Replace the companion partition number with Recovery partition number in /boot/cmdline.txt
#Enables booting into the Recovery partition and accessing the Recovery server.

sudo -H -u root bash -c "sed -i -e 's/\-04/\-02/' /boot/cmdline.txt"

#Reboot into Recovery partition
sudo reboot now
