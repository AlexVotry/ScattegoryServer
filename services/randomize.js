const getLetter = (letters) => {
  const index = getRandom(letters.length);
  const currentLetter = letters[index];
  letters.splice(index, 1)
  // return the currentLetter and remove it from the array.
  return [currentLetter, letters];
};

const getCategories = (categoryList, numberOfCategories) => {
  const list = [];
  for (let i = 0; i < numberOfCategories; i++) {
    const index = getRandom(categoryList.length);
    list.push(categoryList[index]);
    categoryList.splice(index, 1);
  }
  
  return [list, categoryList];
};


function getRandom(max) {
  return Math.floor(Math.random() * Math.floor(max));
}

// create teams based on amount of players. no teams for 3 or less.
function appointTeams(players) {
  const len = players.length;
  const teams = {};
  const teamNames = ["Blue", "Red", "Purple", "Green", "Gold"];

  let noOfTeams = 0;

  if (len <= 3) {
    noOfTeams = len;
  } else if (len > 9) {
    noOfTeams = 5;
  } else {
    noOfTeams = Math.floor(len / 2);
  }

  for (let i = 0; i < noOfTeams; i++) {
    teams[teamNames[i]] = [];
  }

  return teams;
}

module.exports = { getLetter, getCategories, appointTeams };