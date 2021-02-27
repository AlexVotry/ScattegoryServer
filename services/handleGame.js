const letter = require('../data/alphabet');
const categories = require('../data/scattegories');
const { getLetter, getCategories} = require('./randomize');
const { isEmpty } = require('lodash');

let totalTime = {};
let ticker = {};
let middleOfGame = false;
let scattegories = {};
let letters = {};

function handleGame(io, group, clock, totalCategories, gameState) {
  let timer = {};
  timer[group] = clock || 60;
  const numOfCategories = totalCategories || 6;
  setUpNewGame(io, group, numOfCategories, gameState);
  if (gameState === 'running') startGame(io, group, timer[group]);
  else if (gameState === 'pause') stopTimer();
  else if (gameState === "resetRound" || gameState === 'startOver') resetGame(timer[group], group);
}

function startGame(io, group, timer) {
  middleOfGame = true;
  stopTimer(group);
  if (totalTime[group] === 0 || totalTime[group] === undefined) totalTime[group] = timer;
  ticker[group] = setInterval(() => {
      if (totalTime[group] > 0) {
      totalTime[group]--;
      io.to(group).emit('Clock', totalTime[group]);
    } else {
      middleOfGame = false;
      clearInterval(ticker);
      io.to(group).emit('gameState', 'ready');
    }
  }, 1000);
}

function stopTimer(group) {
  if (!isEmpty(ticker)) {
    clearInterval(ticker[group]);
  }
}

function resetGame(timer, group) {
  clearInterval(ticker[group]);
  totalTime[group] = timer;
  middleOfGame = false;
}

function setUpNewGame(io, group, numOfCategories, gameState) {
  if (!middleOfGame && gameState === 'running') {
    scattegories[group] = categories;
    letters[group] = letter;
    const letterArr = getLetter(letters[group]);
    letters[group] = letterArr[1];

    const currentLetter = letterArr[0];
    catArr = getCategories(scattegories[group], numOfCategories);
    scattegories[group] = catArr[1];

    const currentCategories = catArr[0];
    const gameInfo = { currentLetter, categories: currentCategories };
    io.to(group).emit('newGame', gameInfo);
  }
}

module.exports = { handleGame, stopTimer, resetGame };