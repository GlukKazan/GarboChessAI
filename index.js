"use strict";

const garbo = require('./garbochess');
const axios = require('axios');
const _ = require('underscore');

const STATE = {
    INIT: 0,
    TURN: 1,
    MOVE: 2,
    CHCK: 3,
    SESS: 4,
    WAIT: 5,
    STOP: 6,
    RECO: 7
};

const SERVICE  = 'http://127.0.0.1:3000'; // 'http://games.dtco.ru';
const USERNAME = 'garbo';
const PASSWORD = 'garbo';

const MAX_SESSIONS = 3;
const MIN_SESSIONS = 0; // 1;
const AI_TIMEOUT   = 1000; // 5000;

let TOKEN = null;
let sid   = null;
let uid   = null;
let setup = null;
let turn  = null;

function App() {
    this.state  = STATE.INIT;
    this.states = [];
}

let app = new App();

let init = function(app) {
    console.log('INIT');
    app.state = STATE.WAIT;
    axios.post(SERVICE + '/api/auth/login', {
        username: USERNAME,
        password: PASSWORD
    })
    .then(function (response) {
      TOKEN = response.data.access_token;
      app.state = STATE.TURN;
    })
    .catch(function (error) {
      console.log('INIT ERROR: ' + error);
      app.state  = STATE.STOP;
    });
    return true;
}

let recovery = function(app) {
    console.log('RECO');
    app.state = STATE.WAIT;
    axios.post(SERVICE + '/api/session/recovery', {
        id: sid
    }, {
        headers: { Authorization: `Bearer ${TOKEN}` }
    })
    .then(function (response) {
        console.log(response.data);
        uid = response.data.uid;
        app.state = STATE.MOVE;
      })
      .catch(function (error) {
        console.log('INIT ERROR: ' + error);
        app.state  = STATE.STOP;
      });
      return true;
}

let checkTurn = function(app) {
    console.log('TURN');
    app.state = STATE.WAIT;
    axios.get(SERVICE + '/api/session/current', {
        headers: { Authorization: `Bearer ${TOKEN}` }
    })
    .then(function (response) {
        if (response.data.length > 0) {
            console.log(response.data);
            sid = response.data[0].id;
            setup = response.data[0].last_setup;
            app.state = STATE.RECO;
        } else {
            app.state = STATE.CHCK;
        }
      })
      .catch(function (error) {
        console.log('TURN ERROR: ' + error);
        app.state  = STATE.STOP;
      });
      return true;
}

function getSetup() {
    // TODO: FEN Notation

    return '';
}

function FinishTurnCallback(bestMove) {
    if (bestMove != null) {
        garbo.MakeMove(bestMove);
        let move = garbo.FormatMove(bestMove);
        const re = /\s(\w)/;
        const r = move.match(re);
        if (r) {
            const result = setup.match(/[?&]turn=(\d+)/);
            if (result) {
                turn = result[1];
                move = move.replace(re, ((turn == 0) ? ' White ' : ' Black ') + r[1]);
            }
        }
        console.log('move = ' + move);
        app.state  = STATE.WAIT;
        axios.post(SERVICE + '/api/move', {
            uid: uid,
            next_player: (turn == 0) ? 2 : 1,
            move_str: move,
            setup_str: getSetup()
        }, {
            headers: { Authorization: `Bearer ${TOKEN}` }
        })
        .then(function (response) {
            app.state  = STATE.TURN;
          })
          .catch(function (error) {
            console.log('MOVE ERROR: ' + error);
            app.state  = STATE.STOP;
          });
    }
    app.state  = STATE.STOP;
}

let sendMove = function(app) {
    console.log('MOVE');
    console.log('sid = ' + sid);
    console.log('setup = ' + setup);
    app.state  = STATE.WAIT;
    const result = setup.match(/[?&]setup=(.*)/);
    if (result) {
        let fen = result[1];
        const re = /\s[-k][-q][-K][-Q]\s/;
        fen = fen.replace(re, ' ---- '); // TODO: Implement Castling
        console.log('fen = ' + fen);
        garbo.FindMove(fen, AI_TIMEOUT, FinishTurnCallback);
    } else {
        app.state  = STATE.STOP;
    }
    return true;
}

let checkSess = function(app) {
    console.log('CHCK');
    app.state = STATE.WAIT;
    axios.get(SERVICE + '/api/session/my', {
        headers: { Authorization: `Bearer ${TOKEN}` }
    })
    .then(function (response) {
        let data = _.filter(response.data, (it) => {
            return (it.status == 1) || (it.status == 2);
        });
        if (data.length >= MAX_SESSIONS) {
            app.state = STATE.TURN;
            return;
        }
        data = _.filter(response.data, (it) => {
            return (it.status == 1);
        });
        if (data.length >= MIN_SESSIONS) {
            app.state = STATE.TURN;
        } else {
            app.state = STATE.SESS;
        }
      })
      .catch(function (error) {
        console.log('CHCK ERROR: ' + error);
        app.state  = STATE.STOP;
      });
    return true;
}

let addSess = function(app) {
    console.log('SESS');
    app.state = STATE.WAIT;
    axios.post(SERVICE + '/api/session', {
        game_id: 30,
        variant_id: 31,
        selector_value: 1,
        player_num: 2,
        filename: "chess",
        ai: 1
    }, {
        headers: { Authorization: `Bearer ${TOKEN}` }
    })
    .then(function (response) {
        console.log(response.data);
        app.state = STATE.TURN;
      })
      .catch(function (error) {
        console.log('SESS ERROR: ' + error);
        app.state  = STATE.STOP;
      });
    return true;
}

let wait = function(app) {
    console.log('WAIT');
    return true;
}

let stop = function(app) {
    console.log('STOP');
    return false;
}

App.prototype.exec = function() {
    if (_.isUndefined(this.states[this.state])) return true;
    return this.states[this.state](this);
}

app.states[STATE.INIT] = init;
app.states[STATE.WAIT] = wait;
app.states[STATE.STOP] = stop;
app.states[STATE.TURN] = checkTurn;
app.states[STATE.MOVE] = sendMove;
app.states[STATE.CHCK] = checkSess;
app.states[STATE.SESS] = addSess;
app.states[STATE.RECO] = recovery;

let run = function() {
    if (app.exec()) {
        setTimeout(run, 1000);
    }
}
run();
