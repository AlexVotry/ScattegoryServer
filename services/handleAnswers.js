const mongoose = require('mongoose');
const { keysIn, isEqual, each } = require('lodash');
const { mongoUrl } = require('../secrets');

mongoose.connect(mongoUrl, { useNewUrlParser: true, useUnifiedTopology: true, useFindAndModify: false });

const db = require('../models');

async function handleAnswers (answer, group) {
  const team = {
    name: answer.team,
    answers: new Map(JSON.parse(answer.answers))
  }
  team.answers.delete(42); // built in a dummy answer to ensure all participants send and answer, (removing here)

  const finalAnswers = await addTeam(team, group);
  return finalAnswers;
}

async function getFinalAnswers (group) {
    const allAnswers = await getAnswers(group);
    const result = {};

    for (const [team, answerArray] of Object.entries(allAnswers)) {
      const ansObj = {};
      const finalBest = new Map();
      answerArray.forEach(answer => {
        answer.forEach((value, key) => {
          let k = key.substring(0,2);
          if (ansObj.hasOwnProperty(k)) {
            ansObj[k].push(value);
          } else {
            let array = [value];
            ansObj[k] = array;
          }
        })
      })
      
      for(const [key, value] of Object.entries(ansObj)) {
        const popularAnswer = bestAnswer(value);
        finalBest.set(key, popularAnswer);
      };

      // return  object with team name, and new Map of finalAnswers
      const response = await sendBestAnswer({ name: team, finalBest, group });
      result[team] = { answers: response.finalAnswers, score: response.score };
    }
    return result;
}

function compareTeamAnswers(teamAnswers, numOfCategories) {
  const teamNames = keysIn(teamAnswers);
  // for each question, compare one team's answer with each of the other team's answers. Add a "!" on matches.
  // a beautiful triple-nested loop! (Categories won't be more than 12 and teams more than 5);
  for (let i = 0; i < numOfCategories; i++) {
    const index = pad(i);
    for (let j = 0; j < teamNames.length -1; j++) {
      const firstTeam = teamAnswers[teamNames[j]].answers;

      for (let k = j+1; k < teamNames.length; k++) {
        const secondTeam = teamAnswers[teamNames[k]].answers;

        if (firstTeam.has(index)) {
          const answer = firstTeam.get(index);
          // example: blue.get(00) === red.get(00);
          if (!answer.startsWith('!') && secondTeam.has(index)) {
            if (answer === secondTeam.get(index)) {
              secondTeam.set(index, `!${answer}`);
              if (k === teamNames.length - 1) firstTeam.set(index, `!${answer}`);
            }
          }
        }
      }
    }
  }
  teamNames.forEach(team => {
    teamAnswers[team].answers = JSON.stringify(Array.from(teamAnswers[team].answers.entries()));
  })
  return teamAnswers;
}

function addTeam(team, group) {
  return new Promise((resolve, reject) => {
    db.Team.findOneAndUpdate(
      { name: team.name, group },
      { $push: { answers: team.answers }, group },
      { upsert: true, new: true },
      (err, doc) => {
        if (err) {
          throw err;
          reject(err);
        } else {
          resolve(doc);
        }
      })
  })
}

function sendBestAnswer(team) {
  return new Promise((resolve, reject) => {
    db.Team.findOneAndUpdate(
      { name: team.name, group: team.group },
      { finalAnswers: team.finalBest, answers: [] },
      { upsert: true, new: true },
      (err, doc) => {
        if (err) {
          reject(err);
          throw err;
        } else {
          resolve(doc);
        }
      })
  })
}

const updateScores = async (scores, group) => {
  const { score, team } = scores;
  await db.Team.findOneAndUpdate(
    { name: team, group },
    { score },
    { upsert: true },
    (err, doc) => {
      if (err) throw err;
    }
  )
}

const resetScores = async (group) => {
  await db.Team.updateMany(
    { group },
    { score: 0 },
    (err, doc) => {
      if (err) throw err;
    }
  )
}

function getAnswers(group) {
  return new Promise((resolve, reject) => {
    db.Team.find({ group }, (err, doc) => {
      if(err) {
        reject(err);
        throw err;
      } 
      const allTeamAnswers = {};
      doc.forEach(team => {
        allTeamAnswers[team.name] = team.answers;
      });
      resolve(allTeamAnswers);
    });
  })
}

function bestAnswer(arr) {
  const obj = {};
  let max =arr[0];
  arr.forEach(ans => {
    if (obj[ans]) {
      obj[ans]++;
    } else {
      obj[ans] = 1;
    };
    max = obj[max] < obj[ans] ? ans : max;
  });

  return max;
}

function pad(d) {
  return (d < 10) ? '0' + d.toString() : d.toString();
}

module.exports = { handleAnswers, getFinalAnswers, compareTeamAnswers, updateScores, resetScores };