const mongoose = require('mongoose');
const { mongoUrl } = require('./secrets');

const {handleGame, stopTimer, resetGame } = require('./services/handleGame');
const { handleAnswers, getFinalAnswers, compareTeamAnswers, updateScores, resetScores} = require('./services/handleAnswers');
const { createMockTeams, createTeams, getTeams, reJoinTeam } = require('./services/createTeams');
const {keysIn , remove, find, isEmpty} = require('lodash');
const uri = process.env.MONGO_URL || mongoUrl;

mongoose.connect(uri, { useNewUrlParser: true, useUnifiedTopology: true, useFindAndModify: false });

const db = require('./models');
let teams = {};
const players = {};
const allPlayers = {};
let totalPlayers = {};
let numOfCategories = {};
let count = {};
let timer = {};
let room = {};

function socketMain(io, socket) {

  socket.on('initJoin', async localState => {
    console.log('localState:', localState);
    const {name, group, team } = localState;
    socket.join(group);
    room[socket.id] = group;
    const currentUser = await addUserToGroup(localState);
    if (team) {
      await reJoinTeam(localState);
      const currentTeams = await getTeams(group);
      socket.join(team);
      assignTeams(teams, group);
      teams[group] = currentTeams;
      io.to(socket.id).emit('newTeams', teams[group]);
    } else {
      io.to(group).emit('AllUsers', allPlayers[group]);
    }
    console.log(`${name} re-joined ${group} `);
    // socket.emit('initUser', { currentUser: localState, teams: teams[group] });
  });

  socket.on('joinTeam', async formInfo => {
    const {name, group} = formInfo;
    formInfo.id = socket.id;
    room[socket.id] = group;
    socket.join(group);
    console.log(`${name} joined ${group}`);
    const currentUser = await addUserToGroup(formInfo);
    socket.emit('currentUser', currentUser)
    io.to(group).emit('AllUsers', allPlayers[group]);
  });

  socket.on('createTeams', async group => {
    teams[group] = await createTeams(players[group], group);
    totalPlayers[group] = count[group] = players[group].length;
    assignTeams(teams, group);
    timer[group] = 180;
    numOfCategories[group] = 12;
    io.to(group).emit('newTeams', teams[group]);
  });

  socket.on('changeGameState', ({state, group}) => {
    const gState = state === 'startOver' ? 'ready' : state;
    io.to(group).emit('gameState', gState);
    handleGame(io, group, timer[group], numOfCategories[group], state);

    if (state === 'startOver') {
      resetScores(group);
      io.to(group).emit('startOver', numOfCategories[group]);
    }
  });

  socket.on('pushPause', (group) => {
    stopTimer(group);
  });

  // reset timer and new categories and letter
  socket.on('reset', (group) => {
    resetGame(timer[group], group);
    handleGame(io, group, timer[group], numOfCategories[group], 'running');
  })

  // during active play join (team); between play join (room);
  socket.on('myTeam', ({ team, group }) => {
    socket.join(team);
  });

  // every guess goes to the teammates to see.
  socket.on('newGuess', newGuesses => {
    const { guesses, team } = newGuesses;
    console.log(newGuesses)
    io.to(team).emit('updateAnswers', guesses);
  });
  
  socket.on('newMessage', messages => {
    const {team} = messages; // change this to room and send either team or group for 'newMessage'
    io.to(team).emit('updateMessage', messages);
  });
  
  // times up! everyone submits answer. 
  socket.on('FinalAnswer', async finalAnswers => {  
    console.log('finalAnser:', finalAnswers);
    const {group } = finalAnswers;
    await handleAnswers(finalAnswers);
    count[group]--;
    if (count[group] == 0) {
      // determine best answer for each team
      const teamAnswers = await getFinalAnswers(group);
      // compare team's answer to each other and cross out duplicates.
      const finalAnswers = await compareTeamAnswers(teamAnswers, numOfCategories[group])
      io.to(group).emit('AllSubmissions', finalAnswers);
      count[group] = totalPlayers[group];
    }
  });

  socket.on('updateScores', async teamScores => {
    const { score, team, group} = teamScores;
    const currentTeam = teams[group][team];
    const currentScore = currentTeam.slice(-1)[0];
    
    if ( currentScore !== score) {
      currentTeam.splice(-1, 1, score);
      await updateScores(teamScores, group);
    } 
  });

  // if someone disagrees with an answer and the cross it out.
  socket.on('failedAnswer', finalAnswers => {
    const {answers, group} = finalAnswers;
    io.to(group).emit('AllSubmissions', answers)
  });

  // settings button determine length of time and number of categories
  socket.on('gameChoices', gameChoices => {
    const {group, categories} = gameChoices;
    numOfCategories[group] = categories || numOfCategories[group];
    timer[group] = gameChoices.timer * 60;
  });

  socket.on('disconnect', async () => {
    if (socket.id) {
      await removePlayer(socket.id, io);
    }
  })

  function assignTeams(teams, group) {
    totalTeams = Object.keys(teams[group]).length;
    const teamNames = keysIn(teams[group]);
    // at start of game, add 0 to end of team (initial score)
    teamNames.forEach(team => {
      teams[group][team].push(0);
    })
  }
}

const addUserToGroup = async user => {
  const { group, name } = user;
  await db.User.findOneAndUpdate (
    { name: user.name, group },
    user, 
    { upsert: true }, 
    (err, doc) => {
      if (err) throw err;
      else {
        if (allPlayers[group]) {
          players[group].push(user);
          allPlayers[group].push(name)
        } else {
          players[group] = [user];
          allPlayers[group] = [name];
        }
        console.log('allPlayers:', allPlayers);
      }
    })

    return user;
}

const removePlayer = async (id , io)=> {
  const group = room[id];
  let team = null;
  await db.User.findOneAndDelete (
    { id },
    (err, doc) => {
      if (err) {
        console.log('failed quit:', err, doc)
        throw err;
      }
      else {
        const quitter = find(players[group], ['id', id]);
        if (quitter) {
          if (players[group].length) {
            remove(allPlayers[group], player => player === quitter.name);
            remove(players[group], player => player.name === quitter.name);
            totalPlayers[group] = allPlayers[group].length;
            count[group] = totalPlayers[group];
            io.to(group).emit('AllUsers', allPlayers[group]);
            
            if (!isEmpty(teams)) {
              team = teams[group];
              remove(team[quitter.team], player => player.name === quitter.name);
            } 
            db.Group.findOneAndUpdate(
              { name: group },
              { teams: team },
              (err, doc) => {
                if (err) throw err;
              else {
                console.log(`${quitter.name} just left the group...`);
                if(!isEmpty(teams[group])) {
                  io.to(group).emit('newTeams', teams[group]);
                }
              }
            }
            )
            console.log(`${quitter.name} quit`)
          }
        }
      }
    })
  
}

module.exports = socketMain;

