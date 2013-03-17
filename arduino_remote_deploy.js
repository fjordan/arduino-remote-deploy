#!/usr/bin/env node

var five  = require("johnny-five");
var ssh2  = require('ssh2');
var argv  = require('optimist')
            .usage('Usage: $0 -d [dir]')
            .demand(['s', 'u', 'p'])
            .describe('s', 'Deploy script').alias('s', 'script')
            .describe('u', 'SSH username').alias('u', 'username')
            .describe('p', 'SSH password').alias('p', 'password')
            .describe('k', 'SSH keyfile path').alias('k', 'keyfile')
            .argv;

var board = new five.Board({debug: true});
var button;

var config = {
  username: argv.u ? argv.u : 'your-username',
  key_dir: argv.k ? argv.k : 'your-keyfile',
  password: argv.p ? argv.p : 'your-password',
  deploy_script: argv.s ? argv.s : 'your-deploy-script',
  dep_host: 'your.server.hostname'
};

// Time for countdown
var counter = 3;

var SUCCESS = true;
var FAILURE = false;

var safety = false;
var deploy_id = false;
var result = false;

function countdown_and_deploy() {
  counter = 3;
  console.log("Preparing to deploy!");
  deploy_id = setInterval( function() {
    if (counter > 0 && !safety)
      console.log(counter--);
    else {
      if (counter == 0) {
        result = deploy();
        clearInterval(deploy_id);
      } else {
        result = FAILURE;
        clearInterval(deploy_id);
        console.log("Deploy cancelled!");
      }
    }
  }, 1000);
  return result;
}

function deploy_from_host(host, dir) {
  var c = new ssh2();
  c.connect({
    host: host,
    port: 22,
    username: config.username,
    password: config.password,
    privateKey: require('fs').readFileSync(config.key_dir)
  });
  c.on('connect', function() {
    console.log('Connection :: connect');
  });

  c.on('ready', function() {
    console.log('Connection :: ready');
    c.exec(config.deploy_script, function(err, stream) {
      if (err) throw err;
      stream.on('data', function(data, extended) {
        console.log((extended === 'stderr' ? 'STDERR: ' : 'STDOUT: ')
                    + data);
      });
      stream.on('end', function() {
        console.log('Stream :: EOF');
      });
      stream.on('close', function() {
        console.log('Stream :: close');
      });
      stream.on('exit', function(code, signal) {
        console.log('Stream :: exit :: code: ' + code + ', signal: ' + signal);
        c.end();
      });
    });
  });
  c.on('error', function(err) {
    console.log('Connection :: error :: ' + err);
  });
  c.on('end', function() {
    console.log('Connection :: end');
  });
  c.on('close', function(had_error) {
    console.log('Connection :: close');
  });
}

function deploy() {
  return deploy_from_host(config.dep_host, config.deploy_dir);
}

function set_safety(status) {
  status = status || false;
  if (board.debug) {
    console.log("Safety set to "+ status);
  }
  safety = status;
}

board.on("ready", function() {
  button = new five.Button({
    board: board,
    pin: 8,
    holdTime: 3000 /* must hold button down for three seconds to deploy */
  });

  board.repl.inject({
    button: button
  });

  button.on("hold", function() {
    set_safety(false);
    countdown_and_deploy();
  });

  button.on("up", function() {
    set_safety(true);
  });
});
