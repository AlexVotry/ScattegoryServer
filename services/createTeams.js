const mongoose = require('mongoose');
const { uniqWith, isEqual, includes, remove, uniqBy } = require('lodash');
const mockTeams = require('../data/mockTeams');
const { appointTeams } = require('../services/randomize');
const { mongoUrl } = require('../secrets');

mongoose.connect(mongoUrl, { useNewUrlParser: true, useUnifiedTopology: true, useFindAndModify: false });

const db = require('../models');

async function createTeams(players, group) {
  await clearTeams(group);
  const unique = uniqBy(players, 'name');
  let teams = await appointTeams(unique);
  
  while (unique.length) {
    for (let team in teams) {
      let eachUser = unique.splice(0, 1);
      if (eachUser.length) {
        eachUser[0].team = team
        if (!teams[team].includes(eachUser[0])) {
          teams[team].push(...eachUser);
        }
        await db.User.findOneAndUpdate({ email: eachUser[0].email },
          { team: team }, (err, doc) => {
            if (err) throw err;
            else {
              eachUser = [];
            }
          }
        );
      }
    }
  }
  updateGroups(teams, group);

  return teams;
}

async function createMockTeams(players, group) {
  await clearTeams(group);
  let teams = mockTeams;
  const unique = uniqBy(players, 'name');
  
  // load into same team to test team websocket.
  while (unique.length) {
    let eachUser = unique.splice(0, 1);
    if (eachUser.length) {
      const curUser = eachUser[0];
      
      if (unique.length > 1) {
        eachUser[0].team = 'Purple';
        if (!includes(teams.Purple, curUser.name)) {
          teams.Purple.push(...eachUser);
        }
      } else if (eachUser[0].name) {
        eachUser[0].team = 'Green';
        if (includes(teams.Green, curUser.name)) {
          remove(teams.Green, player => player.name === curUser.name)
        }
        teams.Green.push(...eachUser);
      }
      await db.User.findOneAndUpdate({ name: curUser.name },
        { team: curUser.team }, (err, doc) => {
          if (err) throw err;
          else {
            eachUser = [];
          }
        }
      );
    }
  }
  await updateGroups(teams, group);

  return teams;
}

async function updateGroups(teams, group) {
  await db.Group.findOneAndUpdate(
    { name: group },
    {teams},
    { upsert: true },
    (err, doc) => {
      if (err) throw err;
    }
  ).then(() => console.log('updated groups'));
}

const getTeams = group => {
  return new Promise((resolve, reject) => {
    db.Group.find({name: group}, (err, doc) => {
      if (err) {
        reject(err);
        throw err;
      }
      resolve(doc[0].teams);
    });
  })
}

async function clearTeams(group) {
  try {
    await db.Team.deleteMany({ group }).then(() => console.log('data deleted'));
  } catch (error) {
    console.log('clearTeams db.Team', error);
  }

  db.Group.findOneAndUpdate(
    { name: group }, { teams: {'black': 'heart'} }, (err, doc) => {
      if (err) throw err;
    }
  ).then(() => console.log('teams removed from group'));
}

module.exports = { createMockTeams, createTeams, getTeams };