#!/bin/bash

# Parameters:
#
# General:
# $1: Action
#       - read
#       - write
#       - delete
# $2: Chain
#       - input
#       - output
#       - forward
#
# Write:
# $3: Protocol
#       - tcp
#       - udp
#       - all
# $4: Source IP
#       - 0.0.0.0
#       - Any valid IP address
# $5: Source Port
#       - all
#       - Any alias for a port (i.e. ssh, http, http-alt)
#       - Any port number > 0
# $6: Destination IP
#       - 0.0.0.0
#       - Any valid IP address
# $7: Destination Port
#       - all
#       - Any alias for a port (i.e. ssh, http, http-alt)
#       - Any port number > 0
# $8: Probability
#       - Any value 0~1
#
# Delete:
# $3: ID
#       - ID number

ACTION=$1
CHAIN=$2

case $ACTION in
"write")
    # Find the ID of the existing rule, if there is one
    PROTOCOL=$3
    IP_S=$4
    PORT_S=$5
    IP_D=$6
    PORT_D=$7
    PROB=$8

    # if $PROTOCOL is not "tcp" or "udp", set it to "all", clear port values
    if [ $PROTOCOL != "tcp" -a $PROTOCOL != "udp" ]
    then
        PROTOCOL="all"
        PORT_S=0
        PORT_D=0
    fi

    # if IP addresses aren't valid or are 0.0.0.0, set them to "anywhere"
    if [[ ! $IP_S =~ ^[0-9]+.[0-9]+.[0-9]+.[0-9]+$ ]] || [ $IP_S = "0.0.0.0" ]
    then
        IP_S="anywhere"
        IP_OPTION=""    # set IP options for writing while we're at it
    else
        IP_OPTION="-s $IP_S"
    fi
    if [[ ! $IP_D =~ ^[0-9]+.[0-9]+.[0-9]+.[0-9]+$ ]] || [ $IP_D = "0.0.0.0" ]
    then
        IP_D="anywhere"
        IP_OPTION="$IP_OPTION"
    else
        IP_OPTION="$IP_OPTION -d $IP_D"
    fi

    # if the $PORT variables greater than zero, make sure to search for them
    if [ $PROTOCOL != "all" ]
    then
        if [ $PORT_S -gt 0 ]
        then
            PORT_S_GREP="spt:$PORT_S[[:space:]]"
            PORT_OPTION="--sport $PORT_S"     # Take care of this now
        else
            PORT_S_GREP="-v spt:"
            PORT_OPTION=""
        fi

        # dpt will always come after spt, so just tack it on the end
        if [ $PORT_D -gt 0 ]
        then
            PORT_D_GREP="dpt:$PORT_D[[:space:]]"
            PORT_OPTION="$PORT_OPTION --dport $PORT_D"
        else
            PORT_D_GREP="-v dpt:"
            PORT_OPTION=$PORT_OPTION
        fi
    else
        PORT_S_GREP="-v spt:"
        PORT_D_GREP="-v dpt:"
        PORT_OPTION=""
    fi

    RULE=$(sudo iptables -L $CHAIN --line-numbers | grep random | grep -i $PROTOCOL | grep -E "$IP_S[[:space:]]+$IP_D" | grep $PORT_S_GREP | grep $PORT_D_GREP )

    # Get the first element of the matching line, save as ID
    ID=$(echo $RULE | sed -e 's/\([0-9]\+\).*/\1/')

    # If there is an existing rule, replace it.  Otherwise append a new one
    if [ -n "$ID" ]
    then
        WRITE_OPTION="-R $CHAIN $ID"
    else
        WRITE_OPTION="-A $CHAIN"
    fi

    PROTOCOL_OPTION="-p $PROTOCOL $IP_OPTION $PORT_OPTION"

    PROB_OPTION="-m statistic --mode random --probability $PROB"

    # Write the desired line
    sudo iptables $WRITE_OPTION $PROTOCOL_OPTION $PROB_OPTION -j DROP
    ;;
"delete")
    # Delete the rule in question
    ID=$3
    if [ -n "$ID" ]
    then
        sudo iptables -D $CHAIN $ID
    fi
    ;;
esac

# Always return an updated list
sudo iptables -L $CHAIN --line-numbers
