#!/bin/bash
#set -e

# Install Wi-Fi dongle driver, initialize access point and DHCP server
# 
# Make sure you're connected to Wi-Fi before running

# Install Wi-Fi drivers
#sudo ./install-wifi
sudo cp install-wifi /usr/bin/
sudo chmod +x /usr/bin/install-wifi
sudo install-wifi

# Install and Configure Access Point and DHCP Server on wlan1
sudo ./ap-setup.sh
sudo ./dhcp-setup.sh

# Set Mavproxy UDP Broadcast Location
sed -i "/udpbcast/c\--out udpbcast:10.0.0.255:14550" /home/pi/mavproxy.param

# Set Camera UDP Stream Location
sed -i "/udpsink/c\! udpsink host=10.0.0.2 port=5600" /home/pi/gstreamer.param
sed -i "/udpsink/c\! udpsink host=10.0.0.2 port=5600" /home/pi/gstreamer2.param

sudo reboot
