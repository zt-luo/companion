#!/usr/bin/python

import serial
import socket
import time
import json
import struct

# PingEndpoint dependencies
from pymavlink import mavutil
from Ping import Ping
from Ping import Message

debug = False

endpoints = []

class Endpoint(object):
    
    def __init__(self, id, type, connectionIds):
        
        # unique
        self.id = id
        self.type = type
        self.connectionIds = connectionIds
        # target destinations for inbound traffic
        self.connections = []
        
        
    def connect(self, target):
        if target.id == self.id:
            print("loopback not allowed: %s") % self.id
            return
        if target.id in self.connectionIds:
            print("%s is already connected to %s") % (self.id, target.id)
            return
        self.connections.append(target)
        self.connectionIds.append(target.id)
        
        
    def disconnect(self, target_id):
        try:
            self.connectionIds.remove(target_id)
        except:
            print("Error disconnecting %s") % target.id
            return
        
        for endpoint in self.connections:
            if endpoint.id == target_id:
                self.connections.remove(endpoint)


class SerialEndpoint(Endpoint):
    
    def __init__(self, port, baudrate, id, connections):
        Endpoint.__init__(self, id, 'serial', connections)
        self.port = port
        self.baudrate = baudrate
        self.active = False
        
        # not a socket! just a port
        self.socket = serial.Serial()
        self.socket.port = port
        self.socket.baudrate = 115200
        self.socket.timeout = 0
        
        
    def read(self):
        try:
            if not self.socket.is_open:
                self.socket.open()
                print('%s on %s:%s') % (self.id, self.port, self.baudrate)
            data = self.socket.read(1024)
            self.active = True
        except Exception as e:
            self.socket.close()
            self.active = False
            #print("Error reading serial endpoint: %s") % e
            return
        
        if len(data) > 0:
            if debug:
                print('%s read 0x%s') % (self.id, data[:25].encode('hex'))
                
            # write data out on all outbound connections
            for endpoint in self.connections:
                endpoint.write(data, self)
    
    
    def write(self, data, source):
        try:
            if self.socket.is_open:
                self.socket.write(data)
                if debug:
                    print('%s write 0x%s') % (self.id, data[:25].encode('hex'))
                
        # serial.SerialException
        except Exception as e:
            print("Error writing: %s") % e
            return
        
        
    def close(self):
        self.socket.close()
        
    def to_json(self):
        return {"id": self.id,
                "type": self.type,
                "port": self.port,
                "baudrate": self.baudrate,
                "connections": self.connectionIds};
                
        
class UDPEndpoint(Endpoint):
    
    def __init__(self, ip, port, id, connections):
        Endpoint.__init__(self, id, 'udp', connections)
        self.ip = ip
        self.port = port
        self.socket = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        self.socket.setblocking(False)
        self.destination = None
        print('%s on %s:%s') % (self.id, self.ip, self.port)
        if (self.ip == '0.0.0.0'):
            print('binding')
            self.socket.bind((ip, int(port)))
        
    def read(self):
        try:
            data, address = self.socket.recvfrom(1024)
            self.destination = address
        except:
            return
        
        if len(data) > 0:
            if debug:
                print('%s read 0x%s from %s') % (self.id, data[:25].encode('hex'), address)

            for endpoint in self.connections:
                endpoint.write(data, self)
                
    def write(self, data, source):
        try:
            if (self.ip == '0.0.0.0'):
                if (self.destination is None):
                    return
                self.socket.sendto(data, self.destination)
            else:
                self.socket.sendto(data, (self.ip, int(self.port)))
            
            if debug:
                print('%s write 0x%s to %s') % (self.id, data[:25].encode('hex'), self.destination)

        except Exception as e:
            print("Error writing to UDP endpoint: %s") % e
            return
        
    def close(self):
        self.socket.close()


    def to_json(self):
        return {"id": self.id,
                "type": self.type,
                "port": self.port,
                "ip": self.ip,
                "connections": self.connectionIds};


class PingEndpoint(Endpoint):
    def __init__(self, port, baudrate, id, connections):
        Endpoint.__init__(self, id, 'Ping1D', connections)
        self.port = port
        self.baudrate = baudrate
        self.active = False
        self.parsers = {}
        
        # Autopilot output
        self.master = mavutil.mavlink_connection('udpout:0.0.0.0:9000', source_system=66)

        #Make a new Ping
        self.myPing = Ping.Ping1D(port)
        print 'initializing...',
        self.myPing.initialize()
        print 'Done!'
        
        # Read and print distance measurements with confidence
        self.myPing.request(Message.es_distance.id)
        self.last_request = time.time()
        self.got_response = False
        self.last_distance_sensor = time.time()
        self.last_response = 0        
        self.last_remote_request = time.time()

    def read(self):
        try:
            response = None
            data = ""
            while self.myPing.ser.inWaiting():
                byte = self.myPing.ser.read()
                data += byte
                response = self.myPing.parseByte(byte)
                if response != None:
                    self.last_response = time.time()
                    self.got_response = True
                    self.myPing.handleMessage(response)
                    break

            if len(data) > 0:
                if debug:
		    print("%s read 0x%s") % (self.id, data.encode('hex'))
                for endpoint in self.connections:
                    endpoint.write(data, self)
                
            if self.last_remote_request > 1 and time.time() > self.last_response + 0.1:
                self.myPing.request(Message.es_distance.id)
                self.last_request = time.time()
                self.got_response = False
                
            if time.time() > self.last_distance_sensor + 0.2:
                time_boot_ms = 0
                min_distance = 20
                max_distance = 5000
                type = 2
                id = 1
                orientation = 25
                covarience = 0
                self.master.mav.distance_sensor_send(
                        time_boot_ms,
                        min_distance,
                        max_distance,
                        self.myPing.distance,
                        type,
                        id,
                        orientation,
                        covarience)
                
        except Exception as e:
            print("Error reading ping endpoint: %s") % e
    
    def close(self):
        self.myPing.ser.close()
    
    
    def write(self, data, source):
        for byte in data:
            if source.id not in self.parsers:
                self.parsers[source.id] = Ping.Ping1D(None) # another client has connected
            self.remote_response = self.parsers[source.id].parseByte(byte) # the response from remote client app
            if self.remote_response is not None:
                request, payload = self.remote_response
                self.last_remote_request = time.time() # we have received a valid communication from this client
                if request is Message.gen_cmd_request.id:
                    mId = struct.unpack(Message.gen_cmd_request.format, payload)
                    self.myPing.request(mId[0]);
                    if debug:
                        print('%s write %s') % (self.id, data[:25].encode('hex'))

        # serial.SerialException
        #print("Error writing: %s") % e
        #return
        
    def to_json(self):
        return {"id": self.id,
                "type": self.type,
                "port": self.port,
                "baudrate": self.baudrate,
                "connections": self.connectionIds};


def add(new_endpoint):
    for existing_endpoint in endpoints:
        if new_endpoint.id == existing_endpoint.id:
            print("Error adding endpoint %s, id already exists") % new_endpoint.id
            return
    for existing_endpoint in endpoints:
        if new_endpoint.id in existing_endpoint.connectionIds:
            existing_endpoint.connections.append(new_endpoint)
        if existing_endpoint.id in new_endpoint.connectionIds:
            new_endpoint.connections.append(existing_endpoint)
            
    endpoints.append(new_endpoint)


def remove(endpoint_id):
    remove = None
    for endpoint in endpoints:
        if endpoint.id == endpoint_id:
            remove = endpoint
            break
        
    if remove is None:
        print("Error removing endpoint %s, id doesn't exist") % endpoint_id
        return
    
    print("remove: %s") % remove
    try:
        remove.close()
        endpoints.remove(remove)
        print("removed endpoint %s") % remove.id
        
        
        for endpoint in endpoints:
            endpoint.connections.remove(remove)
            endpoint.connections.connectionIds.remove(remove.id)
                
                
    except Exception as e:
        #print("Error removing: %s") % e
        pass


def to_json(endpoint_id=None):
    configuration = []
    for endpoint in endpoints:
        configuration.append(endpoint.to_json())
    configuration = {"endpoints": configuration}
    return json.dumps(configuration, indent=4)

def from_json(endpoint_json):
    new_endpoint = None
    if endpoint_json['type'] == 'serial':
        # do we need this here?
        if ('Ping1D' in endpoint_json['port']):
            new_endpoint = PingEndpoint(
                            endpoint_json['port'],
                            endpoint_json['baudrate'],
                            endpoint_json['id'],
                            endpoint_json['connections'])
        else:
            new_endpoint = SerialEndpoint(
                                endpoint_json['port'],
                                endpoint_json['baudrate'],
                                endpoint_json['id'],
                                endpoint_json['connections'])
        
    elif endpoint_json['type'] == 'udp':
        new_endpoint = UDPEndpoint(
                            endpoint_json['ip'],
                            endpoint_json['port'],
                            endpoint_json['id'],
                            endpoint_json['connections'])
        
    elif endpoint_json['type'] == 'Ping1D':
        new_endpoint = PingEndpoint(
                endpoint_json['port'],
                endpoint_json['baudrate'],
                endpoint_json['id'],
                endpoint_json['connections'])
        
    if new_endpoint is None:
        print 'Endpoint could not be decoded from json', endpoint_json
    return new_endpoint


def connect(source_id, target_id):
    source = None
    target = None
    for endpoint in endpoints:
        if endpoint.id == source_id:
            source = endpoint
        if endpoint.id == target_id:
            target = endpoint
            
    if source is None:
        print("Error: source %s is not present") % source_id
        
    if target is None:
        print("Error: target %s is not present") % target_id
        
    source.connect(target)


def disconnect(source_id, target_id):
    source = None

    for endpoint in endpoints:
        if endpoint.id == source_id:
            source = endpoint
            
    if source is None:
        print("Error: source %s is not present") % source_id
        
    #it's ok if target does not exist, it may still be a desired endpoint
        
    source.disconnect(target_id)


def get_endpoints():
    return endpoints


def save(filename):
    f = open(filename, 'w+')
    f.write(to_json())
    f.close()


def load(filename):
    try:
        f = open(filename, 'r')
        configuration = json.load(f)
        f.close()
    except Exception as e:
        print("Error loading from file %s: %s") % (filename, e)
        return
    
    for endpoint in configuration['endpoints']:
        try:
            if endpoint['type'] == 'serial':
                new_endpoint = SerialEndpoint(
                                    endpoint['port'],
                                    endpoint['baudrate'],
                                    endpoint['id'],
                                    endpoint['connections'])
                
            elif endpoint['type'] == 'udp':
                new_endpoint = UDPEndpoint(
                                    endpoint['ip'],
                                    endpoint['port'],
                                    endpoint['id'],
                                    endpoint['connections'])
            elif endpoint['type'] == 'Ping1D':
                new_endpoint = PingEndpoint(
                                    endpoint['port'],
                                    endpoint['baudrate'],
                                    endpoint['id'],
                                    endpoint['connections'])
            
            add(new_endpoint)
        
        except Exception as e:
            print(e)
            
