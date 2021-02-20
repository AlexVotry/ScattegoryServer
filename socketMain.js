const mongoose = require('mongoose');
const { mongoUrl } = require('./secrets');

const {handleGame, stopTimer, resetGame } = require('./services/handleGame');
const { handleAnswers, getFinalAnswers, compareTeamAnswers, updateScores, resetScores} = require('./services/handleAnswers');
const {createMockTeams, createTeams, getTeams } = require('./services/createTeams');
const {keysIn , remove, find, isEmpty} = require('lodash');
const uri = process.env.MONGO_URL || mongoUrl;

mongoose.connect(uri, { useNewUrlParser: true, useUnifiedTopology: true, useFindAndModify: false });

const db = require('./models');
let teams = {};
const players = [];
const allPlayers = [];
let totalPlayers;
let numOfCategories = 12;
let teamNames;
let count = totalPlayers;
let teamGroup;
let timer = 180;

function socketMain(io, socket) {
  let room = '';

  socket.on('initJoin', async localState => {
    const {name, group, team } = localState;
    teamGroup = group;
    socket.join(group);
    socket.join(team);
    room = team;
    const currentTeams = await getTeams(group);
    teams = currentTeams;
    console.log(`${name} re-joined ${group} `);
    assignTeams(teams);
    socket.emit('initUser', { currentUser: localState, teams });
  });

  socket.on('joinTeam', async formInfo => {
    const {name, group} = formInfo;
    formInfo.id = socket.id;
    teamGroup = group;
    socket.join(group);
    room = group;
    console.log(`${name} joined ${group}`);
    const currentUser = await addUserToGroup(formInfo);
    socket.emit('currentUser', currentUser)
    io.to(teamGroup).emit('AllUsers', allPlayers);
  });

  socket.on('createTeams', async data => {
    teams = await createMockTeams(players, teamGroup);
    totalPlayers = count = players.length;
    assignTeams(teams);
    io.to(room).emit('newTeams', teams);
  });

  socket.on('changeGameState', (gameState) => {
    const gState = gameState === 'startOver' ? 'ready' : gameState;
    io.to(room).emit('gameState', gState);
    handleGame(io, room, timer, numOfCategories, gameState);

    if (gameState === 'startOver') {
      resetScores(teamGroup);
      io.to(room).emit('startOver', numOfCategories);
    }
  });

  socket.on('pushPause', () => {
    stopTimer();
  });

  // reset timer and new categories and letter
  socket.on('reset', () => {
    resetGame(timer);
    handleGame(io, room, timer, numOfCategories, 'running');
  })

  // during active play join (team); between play join (room);
  socket.on('myTeam', team => {
    socket.join(team);
  });

  // every guess goes to the teammates to see.
  socket.on('newGuess', newGuesses => {
    const { guesses, team } = newGuesses;
    io.to(team).emit('updateAnswers', guesses);
  });
  
  socket.on('newMessage', messages => {
    const {team} = messages;
    if (teams[team].length > 1) {
      io.to(team).emit('updateMessage', messages);
    } else {
      io.to(teamGroup).emit('updateMessage', messages);
    }
  });
  
  // times up! everyone submits answer. 
  socket.on('FinalAnswer', async finalAnswers => {  
    // console.log(' teams:', teams);
    await handleAnswers(finalAnswers, teamGroup);
    count--;
    if (count == 0) {
      // determine best answer for each team
      const teamAnswers = await getFinalAnswers(teamGroup);
      // compare team's answer to each other and cross out duplicates.
      const finalAnswers = await compareTeamAnswers(teamAnswers, numOfCategories)
      io.to(room).emit('AllSubmissions', finalAnswers);
      count = totalPlayers;
    }
  });

  socket.on('updateScores', async teamScores => {
    const { score, team} = teamScores;
    const currentTeam = teams[team];
    const currentScore = currentTeam.slice(-1)[0];
    
    if ( currentScore !== score) {
      currentTeam.splice(-1, 1, score);
      await updateScores(teamScores, teamGroup);
    } 
  });

  // if someone disagrees with an answer and the cross it out.
  socket.on('failedAnswer', finalAnswers => {
    io.to(teamGroup).emit('AllSubmissions', finalAnswers)
  });

  // settings button determine length of time and number of categories
  socket.on('gameChoices', gameChoices => {
    numOfCategories = gameChoices.categories || numOfCategories;
    timer = gameChoices.timer * 60;
  });

  socket.on('disconnect', async () => {
    if (socket.id) {
      await removePlayer(socket.id, io);
    }
  })

  function assignTeams(teams) {
    totalTeams = Object.keys(teams).length;
    teamNames = keysIn(teams);
    // at start of game, add 0 to end of team (initial score)
    teamNames.forEach(team => {
      teams[team].push(0);
    })
  }
}

const addUserToGroup = async user => {
  await db.User.findOneAndUpdate (
    { name: user.name, group: user.group },
    user, 
    { upsert: true }, 
    (err, doc) => {
      if (err) throw err;
      else {
        players.push(user);
        allPlayers.push(user.name)
      }
    })

    return user;
}

const removePlayer = async (id , io)=> {
console.log('id:', id);

  await db.User.findOneAndDelete (
    { id },
    (err, doc) => {
      if (err) {
        console.log('failed quit:', err, doc)
        throw err;
      }
      else {
        if (players.length) {
          const quitter = find(players, ['id', id]);
          console.log(`${quitter.name} quit`)
          remove(allPlayers, player => player === quitter.name);
          remove(players, player => player.name === quitter.name);
          remove(teams[quitter.team], player => player.name === quitter.name);
          totalPlayers = allPlayers.length;
          count = totalPlayers;
          io.to(teamGroup).emit('AllUsers', allPlayers);
          db.Group.findOneAndUpdate(
            { name: quitter.group },
            { teams },
            (err, doc) => {
              if (err) throw err;
              else {
                console.log(`${quitter.name} just left the group...`);
                if(!isEmpty(teams)) {
                  io.to(quitter.group).emit('newTeams', teams);
                }
              }
            }
          )
        }
      }
    })
  
}

module.exports = socketMain;

