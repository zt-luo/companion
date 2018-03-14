#!/bin/bash
#set -e

# Install/set up/modify DNSMASQ DHCP settings
#
# Based on: https://gist.github.com/Lewiscowles1986/fecd4de0b45b2029c390
#
# Inputs (TODO):
#   - Network interface (limit to wlan1?)
#   - Pi IP address for interface
#   - IP address range
#   - Netmask
#   - DHCP lease time

#Define default values
INTERFACE="wlan1"
IPADDRESS="10.0.0.1"
IPRANGEMIN="10.0.0.2"
IPRANGEMAX="10.0.0.2"
NETMASK="255.255.255.0"
NETWORK="10.0.0.0"
BROADCAST="10.0.0.255"
DHCPLEASE="2m"

# Make sure script has been run as root
if [ "$EUID" -ne 0 ]
	then echo "Must be root"
	exit 1
fi

#if [[ $# -lt 1 ]]; 
#	then echo "You need to pass a password!"
#	echo "Usage:"
#	echo "sudo $0 yourChosenPassword [apName]"
#	exit
#fi

# Handle inputs
#if [[ $# -eq 2 ]]; then
#	APSSID=$2
#fi

# Update/install dnsmasq
apt-get update -yqq
apt-get upgrade -yqq
apt-get install dnsmasq -yqq


# CONFIGURE DHCP SERVER
cat > /etc/dnsmasq.conf <<EOF
interface=$INTERFACE
dhcp-range=$IPRANGEMIN,$IPRANGEMAX,$NETMASK,$DHCPLEASE
EOF


# STATIC IP CONFIGURATION
# Add empty line to end of file for easier processing
sed -i '$a\
' /etc/network/interfaces

# Delete existing configuration for interface
sed -i "/$INTERFACE/,/^\s*$/d"            /etc/network/interfaces

# Write new settings for interface
sed -i "\$a allow-hotplug $INTERFACE"     /etc/network/interfaces
sed -i "\$a iface $INTERFACE inet static" /etc/network/interfaces
sed -i "\$a \ \ \ \ address $IPADDRESS"   /etc/network/interfaces
sed -i "\$a \ \ \ \ netmask $NETMASK"     /etc/network/interfaces
sed -i "\$a \ \ \ \ network $NETWORK"     /etc/network/interfaces
sed -i "\$a \ \ \ \ broadcast $BROADCAST" /etc/network/interfaces


# DHCPCD CONFIGURATION
# Remove denyinterfaces lines from dhcpcd.conf
sed -i "/denyinterfaces $INTERFACE/d"  /etc/dhcpcd.conf

# Add denyinterfaces line for DHCP interface
sed -i "\$a denyinterfaces $INTERFACE" /etc/dhcpcd.conf


# START DNSMASQ
systemctl enable dnsmasq
sudo systemctl start dnsmasq

echo "All done! Please reboot to implement changes"
