
// Compare todo list titles alphabetically
const compareByTitle = (itemA, itemB) => {
  let titleA = itemA.title.toLowerCase();
  let titleB = itemB.title.toLowerCase();
  if (titleA > titleB) {
    return 1;
  } else if (titleA < titleB) {
    return -1;
  } else {
    return 0;
  }
}

// return the list of todo lists sorted by completion status and title.
const sortTodoLists = lists => {
  return lists.slice().sort(compareByTitle).sort((a, b) => a.isDone() - b.isDone());
};

// Return the list of todos in the todo list sorted by completion status and title.
const sortTodos = todoList => {
  let undone = todoList.todos.filter(todo => !todo.isDone());
  let done   = todoList.todos.filter(todo => todo.isDone());
  undone.sort(compareByTitle);
  done.sort(compareByTitle);
  return [].concat(undone, done);
};

module.exports = {
  sortTodoLists,
  sortTodos,
}