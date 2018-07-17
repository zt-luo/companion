#!/bin/bash

S1="iface eth0 inet manual"

sudo sed -i -e '/iface eth0 inet manual/,+1d' /etc/network/interfaces
sudo sed -i -e '/eth0 inet static/,+3d' /etc/network/interfaces
sudo sed -i -e '/eth0 inet dhcp/,+1d' /etc/network/interfaces
sudo sed -i -e 's/\s*ip=[0-9]*\.[0-9]*\.[0-9]*\.[0-9]*//' /boot/cmdline.txt
sudo sed -i -e "\$a$S1" /etc/network/interfaces
sudo sed -i -e '1{s/$/ ip=192.168.2.2/}' /boot/cmdline.txt

sudo update-rc.d -f isc-dhcp-server remove
sudo service isc-dhcp-server stop
sudo reboot now


