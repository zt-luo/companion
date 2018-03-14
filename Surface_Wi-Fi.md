# Setting up Companion for Surface Wi-Fi Use

From a fresh Companion image, follow the following steps to configure Companion for surface Wi-Fi access point use:

1. Make sure the Pi is connected to the internet
  - go to the [Companion web UI](http://192.168.2.2:2770) and connect to your Wi-Fi network using the GUI
2. SSH into the Pi and run the following commands:
```bash
cd /home/pi/companion
git fetch origin surface
git checkout surface
cd scripts
sudo ./surface-setup.sh
```
3. Reboot for the changes to take effect.  The Pi will now create its own access point called "Companion" with the password "companion".
