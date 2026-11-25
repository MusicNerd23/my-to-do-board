const { randomUUID } = require("node:crypto");
const { RequestError } = require("./http");

function newList(title) {
  return { id: randomUUID(), title, cards: [] };
}

function createBoard(existingTasks) {
  const todo = newList("To do");
  const inProgress = newList("In progress");
  const done = newList("Done");

  for (const task of existingTasks) {
    const list = task.completed ? done : todo;
    list.cards.push({ id: task.id, title: task.title });
  }

  return { lists: [todo, inProgress, done] };
}

function getIndex(items, id, type) {
  const index = items.findIndex((item) => item.id === id);
  if (index === -1) throw new RequestError(404, `That ${type} could not be found.`);
  return index;
}

function insertBefore(items, item, beforeId, type) {
  const index = beforeId == null ? items.length : getIndex(items, beforeId, type);
  items.splice(index, 0, item);
}

function readTitle(value, type, maxLength) {
  const title = typeof value === "string" ? value.trim() : "";
  if (!title || title.length > maxLength) {
    throw new RequestError(400, `Enter a ${type} title between 1 and ${maxLength} characters.`);
  }
  return title;
}

function applyBoardAction(board, action) {
  const { lists } = board;
  if (action?.type === "add-list") {
    lists.push(newList(readTitle(action.title, "list", 60)));
    return;
  }

  const listIndex = getIndex(lists, action?.listId, "list");
  const list = lists[listIndex];
  switch (action.type) {
    case "rename-list":
      list.title = readTitle(action.title, "list", 60);
      return;
    case "delete-list":
      lists.splice(listIndex, 1);
      return;
    case "move-list":
      if (action.beforeId === list.id) return;
      lists.splice(listIndex, 1);
      insertBefore(lists, list, action.beforeId, "list");
      return;
    case "add-card":
      list.cards.push({ id: randomUUID(), title: readTitle(action.title, "card", 120) });
      return;
    case "update-card":
    case "delete-card":
    case "move-card":
      applyCardAction(lists, list, action);
      return;
    default:
      throw new RequestError(400, "Choose a board action.");
  }
}

function applyCardAction(lists, list, action) {
  const cardIndex = getIndex(list.cards, action.cardId, "card");
  const card = list.cards[cardIndex];
  if (action.type === "delete-card") {
    list.cards.splice(cardIndex, 1);
    return;
  }

  const destination = lists[getIndex(lists, action.toListId, "list")];
  if (action.type === "update-card") {
    card.title = readTitle(action.title, "card", 120);
    if (destination === list) return;
  }
  if (destination === list && action.beforeId === card.id) return;

  list.cards.splice(cardIndex, 1);
  insertBefore(destination.cards, card, action.beforeId, "card");
}

module.exports = { applyBoardAction, createBoard };
