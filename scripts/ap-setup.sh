#!/bin/bash
#set -e

# Install/set up/modify HOSTAPD access point settings
#
# Based on: https://gist.github.com/Lewiscowles1986/fecd4de0b45b2029c390
#
# Inputs (TODO):
#   - Network interface (limit to wlan1?)
#   - SSID
#   - Password

#Define default values
INTERFACE="wlan1"
APSSID="Companion"
APPASS="companion"

# Make sure script has been run as root
if [ "$EUID" -ne 0 ]
	then echo "Must be root"
	exit
fi

#if [[ $# -lt 1 ]]; 
#	then echo "You need to pass a password!"
#	echo "Usage:"
#	echo "sudo $0 yourChosenPassword [apName]"
#	exit
#fi

#if [[ $# -eq 2 ]]; then
#	APSSID=$2
#fi

# Update/install dnsmasq
apt-get remove --purge hostapd -yqq
apt-get update -yqq
apt-get upgrade -yqq
apt-get install hostapd -yqq


# CONFIGURE ACCESS POINT
cat > /etc/hostapd/hostapd.conf <<EOF
interface=$INTERFACE
hw_mode=g
channel=10
auth_algs=1
wpa=2
wpa_key_mgmt=WPA-PSK
wpa_pairwise=CCMP
rsn_pairwise=CCMP
wpa_passphrase=$APPASS
ssid=$APSSID
ieee80211n=1
wmm_enabled=1
ht_capab=[HT40][SHORT-GI-20][DSSS_CCK-40]
EOF

# SET HOSTAPD DAEMON CONFIG FILE
sed -i '/DAEMON_CONF/d'                             /etc/default/hostapd
sed -i '$a DAEMON_CONF="/etc/hostapd/hostapd.conf"' /etc/default/hostapd

# START HOSTAPD
systemctl enable hostapd
sudo systemctl start hostapd

echo "All done! Please reboot"
