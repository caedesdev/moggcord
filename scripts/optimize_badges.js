const fs = require('fs');
const path = require('path');

const inputPath = path.join(__dirname, '..', 'merged_badges.json');
const outputPath = path.join(__dirname, '..', 'badges.json');

const currentData = JSON.parse(fs.readFileSync(inputPath, 'utf8'));

const newData = {
  badges: {},
  users: {}
};

let badgeCounter = 1;
const badgeMap = new Map(); // key: json string of badge, value: badgeId

for (const userId in currentData) {
  const userBadges = currentData[userId];
  const userBadgeIds = [];

  for (const badgeObj of userBadges) {
    // Some badges have "icon", "badge", "tooltip", "description", "name" etc.
    // We normalize them into just badge and tooltip in our definition, or keep all properties.
    const normalizedBadge = {
      badge: badgeObj.badge || badgeObj.iconSrc || badgeObj.icon || badgeObj.url || "",
      tooltip: badgeObj.tooltip || badgeObj.description || badgeObj.label || badgeObj.name || ""
    };
    
    // Add extra properties just in case
    for (const key in badgeObj) {
        if (!['badge', 'iconSrc', 'icon', 'url', 'tooltip', 'description', 'label', 'name'].includes(key)) {
            normalizedBadge[key] = badgeObj[key];
        }
    }

    const badgeStr = JSON.stringify(normalizedBadge);
    
    let badgeId;
    if (badgeMap.has(badgeStr)) {
      badgeId = badgeMap.get(badgeStr);
    } else {
      // Create a nice ID based on tooltip if possible, else just auto increment
      let baseId = normalizedBadge.tooltip.toLowerCase().replace(/[^a-z0-9]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');
      if (!baseId) baseId = "badge";
      
      badgeId = baseId;
      if (newData.badges[badgeId] && JSON.stringify(newData.badges[badgeId]) !== badgeStr) {
          let suffix = 2;
          while (newData.badges[`${badgeId}_${suffix}`]) {
              suffix++;
          }
          badgeId = `${badgeId}_${suffix}`;
      }
      
      badgeMap.set(badgeStr, badgeId);
      newData.badges[badgeId] = normalizedBadge;
    }
    
    userBadgeIds.push(badgeId);
  }
  
  newData.users[userId] = userBadgeIds;
}

fs.writeFileSync(outputPath, JSON.stringify(newData, null, 2));
console.log(`Optimized badges saved to ${outputPath}`);
console.log(`Original size: ${fs.statSync(inputPath).size} bytes`);
console.log(`New size: ${fs.statSync(outputPath).size} bytes`);
