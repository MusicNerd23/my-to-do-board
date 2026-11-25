function createBoardView({ save, showError, sessionExpired }) {
  const controls = document.querySelector("#board-controls");
  const boardLists = document.querySelector("#board-lists");
  const summary = document.querySelector("#board-summary");
  const emptyBoard = document.querySelector("#empty-board");
  const listForm = document.querySelector("#list-form");
  const listTemplate = document.querySelector("#list-template");
  const cardTemplate = document.querySelector("#card-template");
  const dialog = document.querySelector("#edit-dialog");
  const editForm = document.querySelector("#edit-form");
  const editHeading = document.querySelector("#edit-heading");
  const editTitle = document.querySelector("#edit-title");
  const moveField = document.querySelector("#move-field");
  const moveList = document.querySelector("#move-list");
  const deleteCard = document.querySelector("#delete-card");
  const editError = document.querySelector("#edit-error");
  let board;
  let editing;
  let dragged;
  let dropMark;
  let saving = false;
  let version = 0;

  function cardInput(listId) {
    return [...boardLists.querySelectorAll(".list-column")]
      .find((column) => column.dataset.listId === listId)?.querySelector(".card-form input");
  }

  function showEditError(message = "") {
    editError.textContent = message;
    editError.hidden = !message;
  }

  function setSaving(value) {
    saving = value;
    controls.inert = value;
    editForm.inert = value;
  }

  async function change(action, reportError = showError) {
    if (saving || !board) return false;
    const requestVersion = version;
    showError();
    setSaving(true);

    try {
      const updated = await save(action);
      if (requestVersion !== version) return false;
      board = updated;
      render(action.type === "add-card" ? action.listId : undefined);
      return true;
    } catch (error) {
      if (requestVersion !== version) return false;
      if (error.status === 401) sessionExpired();
      else reportError(error.message);
      return false;
    } finally {
      if (requestVersion === version) setSaving(false);
    }
  }

  function openEditor(list, card) {
    editing = { listId: list.id, cardId: card?.id };
    editHeading.textContent = card ? "Edit card" : "Rename list";
    editTitle.value = (card || list).title;
    editTitle.maxLength = card ? 120 : 60;
    moveField.hidden = !card;
    deleteCard.hidden = !card;
    moveList.replaceChildren(...board.lists.map((item) => new Option(item.title, item.id)));
    moveList.value = list.id;
    showEditError();
    dialog.showModal();
    editTitle.focus();
  }

  function renderCard(list, card) {
    const row = cardTemplate.content.firstElementChild.cloneNode(true);
    const button = row.querySelector("button");
    row.dataset.cardId = card.id;
    button.textContent = card.title;
    button.title = "Edit or move card";
    button.addEventListener("click", () => openEditor(list, card));
    return row;
  }

  function renderList(list, index, draft) {
    const column = listTemplate.content.firstElementChild.cloneNode(true);
    column.dataset.listId = list.id;
    column.setAttribute("aria-label", list.title);
    column.querySelector("h2").textContent = list.title;
    column.querySelector(".list-count").textContent = list.cards.length;
    column.querySelector(".card-list").append(...list.cards.map((card) => renderCard(list, card)));

    const form = column.querySelector(".card-form");
    const input = form.elements.title;
    input.setAttribute("aria-label", `New card in ${list.title}`);
    input.value = draft;
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (await change({ type: "add-card", listId: list.id, title: input.value })) {
        cardInput(list.id)?.focus();
      }
    });

    const menu = column.querySelector("details");
    menu.querySelector("summary").setAttribute("aria-label", `Actions for ${list.title}`);
    menu.querySelector('[data-action="earlier"]').disabled = index === 0;
    menu.querySelector('[data-action="later"]').disabled = index === board.lists.length - 1;
    menu.addEventListener("click", async (event) => {
      const action = event.target.closest("button")?.dataset.action;
      if (!action) return;
      menu.open = false;

      if (action === "rename") {
        openEditor(list);
        return;
      }
      if (action === "delete") {
        if (list.cards.length && !window.confirm(`Delete “${list.title}” and its cards?`)) return;
        if (await change({ type: "delete-list", listId: list.id })) listForm.elements.title.focus();
        return;
      }

      const beforeId = board.lists[action === "earlier" ? index - 1 : index + 2]?.id ?? null;
      if (await change({ type: "move-list", listId: list.id, beforeId })) cardInput(list.id)?.focus();
    });
    return column;
  }

  function render(addedTo) {
    const drafts = new Map([...boardLists.querySelectorAll(".list-column")].map((column) => [
      column.dataset.listId,
      column.querySelector(".card-form input").value,
    ]));
    drafts.delete(addedTo);
    boardLists.replaceChildren(...board.lists.map((list, index) => renderList(list, index, drafts.get(list.id) ?? "")));

    const listCount = board.lists.length;
    const cardCount = board.lists.reduce((total, list) => total + list.cards.length, 0);
    summary.textContent = `${listCount} ${listCount === 1 ? "list" : "lists"} · ${cardCount} ${cardCount === 1 ? "card" : "cards"}`;
    emptyBoard.hidden = listCount > 0;
  }

  listForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const input = listForm.elements.title;
    if (await change({ type: "add-list", title: input.value })) {
      listForm.reset();
      boardLists.lastElementChild?.scrollIntoView({ block: "nearest", inline: "nearest" });
      input.focus({ preventScroll: true });
    }
  });

  editForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    showEditError();
    const destination = editing.cardId ? moveList.value : editing.listId;
    const action = {
      ...editing,
      type: editing.cardId ? "update-card" : "rename-list",
      title: editTitle.value,
      toListId: destination,
    };
    if (await change(action, showEditError)) {
      dialog.close();
      cardInput(destination)?.focus();
    }
  });

  deleteCard.addEventListener("click", async () => {
    showEditError();
    const listId = editing.listId;
    if (await change({ ...editing, type: "delete-card" }, showEditError)) {
      dialog.close();
      cardInput(listId)?.focus();
    }
  });

  document.querySelector("#cancel-edit").addEventListener("click", () => dialog.close());
  dialog.addEventListener("cancel", (event) => {
    if (saving) event.preventDefault();
  });

  function clearDropMark() {
    if (dropMark) dropMark.element.classList.remove(dropMark.marker);
    dropMark = null;
  }

  function clearDrag() {
    clearDropMark();
    dragged?.source.classList.remove("dragging");
    dragged = null;
  }

  function dropPosition(event) {
    const column = event.target.closest(".list-column");
    if (!dragged || !column) return null;

    if (dragged.type === "move-list") {
      const bounds = column.getBoundingClientRect();
      const vertical = getComputedStyle(boardLists).gridAutoFlow === "row";
      const before = vertical ? event.clientY < bounds.top + bounds.height / 2 : event.clientX < bounds.left + bounds.width / 2;
      const neighbor = before ? column : column.nextElementSibling;
      return {
        element: column,
        marker: before ? "list-drop-before" : "list-drop-after",
        fields: { beforeId: neighbor?.dataset.listId ?? null },
      };
    }

    let card = event.target.closest(".card");
    if (card) {
      const bounds = card.getBoundingClientRect();
      if (event.clientY > bounds.top + bounds.height / 2) card = card.nextElementSibling;
    }

    return {
      element: card || column,
      marker: card ? "card-drop-before" : "card-drop-append",
      fields: { toListId: column.dataset.listId, beforeId: card?.dataset.cardId ?? null },
    };
  }

  boardLists.addEventListener("dragstart", (event) => {
    const column = event.target.closest(".list-column");
    const card = event.target.closest(".card");
    const handle = event.target.closest(".list-handle");
    if (!column || (!card && !handle)) return;
    dragged = {
      type: card ? "move-card" : "move-list",
      listId: column.dataset.listId,
      cardId: card?.dataset.cardId,
      source: card || column,
    };
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", "Board item");
    dragged.source.classList.add("dragging");
  });

  boardLists.addEventListener("dragover", (event) => {
    const position = dropPosition(event);
    if (!position) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    if (dropMark?.element === position.element && dropMark.marker === position.marker) return;
    clearDropMark();
    dropMark = position;
    position.element.classList.add(position.marker);
  });

  boardLists.addEventListener("dragleave", (event) => {
    if (!boardLists.contains(event.relatedTarget)) clearDropMark();
  });

  boardLists.addEventListener("drop", (event) => {
    const position = dropPosition(event);
    if (!position) return;
    event.preventDefault();
    const { type, listId, cardId } = dragged;
    clearDrag();
    change({ type, listId, cardId, ...position.fields });
  });
  boardLists.addEventListener("dragend", clearDrag);

  return {
    load(data) {
      board = data;
      render();
    },
    clear() {
      version += 1;
      board = null;
      editing = null;
      clearDrag();
      setSaving(false);
      dialog.close();
      boardLists.replaceChildren();
      listForm.reset();
    },
  };
}
