#!/bin/bash

if dpkg-query -W -f='${Status}' isc-dhcp-server 1>/dev/null; then
	echo "Already installed"
	sudo apt-get upgrade isc-dhcp-server
else
	sudo apt-get update --yes
	sudo apt-get install isc-dhcp-server --yes
fi

S1="iface eth0 inet static"
S2="address 192.168.2.2"
S3="netmask 255.255.255.0"
sudo sed -i -e '/iface eth0 inet manual/,+1d' /etc/network/interfaces
sudo sed -i -e '/eth0 inet static/,+3d' /etc/network/interfaces
sudo sed -i -e '/eth0 inet dhcp/,+1d' /etc/network/interfaces
sudo sed -i -e "\$a$S1" \
-e "\$a$S2" \
-e "\$a$S3" \
/etc/network/interfaces

S4="subnet 192.168.2.0 netmask 255.255.255.0 {"
S5="\\\trange 192.168.2.3 192.168.2.254;"
S6="}"

sudo sed -i -e '/subnet 192.168.2.0/,+6d' /etc/dhcp/dhcpd.conf
sudo sed -i -e "\$a$S4" \
-e "\$a$S5" \
-e "\$a$S6" \
/etc/dhcp/dhcpd.conf

sudo sed -i -e '/default-lease-time/s/.*/default-lease-time 43200;/' /etc/dhcp/dhcpd.conf
sudo sed -i -e '/max-lease-time/s/.*/max-lease-time 43200;/' /etc/dhcp/dhcpd.conf
sudo sed -i -e '/authoritative;/s/^#//g' /etc/dhcp/dhcpd.conf
sudo sed -i -e '/option domain-name/d' /etc/dhcp/dhcpd.conf

S9="DHCPD_CONF=/etc/dhcp/dhcpd.conf"
S10="DHCPD_PID=/var/run/dhcpd.pid"
S11="INTERFACES=\"eth0\""

sudo sed -i -e "/DHCPD_CONF=/s:.*:$S9:" \
-e "/DHCPD_PID=/s:.*:$S10:" \
-e "/INTERFACES=/s:.*:$S11:" \
/etc/default/isc-dhcp-server

sudo service isc-dhcp-server restart
sudo update-rc.d isc-dhcp-server defaults
sudo reboot now

