const express = require("express");
const morgan = require("morgan");
const flash = require("express-flash");
const session = require("express-session");
const { body, validationResult } = require("express-validator");
const TodoList = require("./lib/todolist");
const Todo = require("./lib/todo");
const { sortTodoLists, sortTodos } = require("./lib/sort");
const store = require("connect-loki");

const app = express();
const host = "localhost";
const port = 3000;
const LokiStore = store(session);

app.set("views", "./views");
app.set("view engine", "pug");

app.set(morgan("common"));
app.use(express.static("public"));
app.use(express.urlencoded({ extended: false }));

app.use(session({
  cookie: {
    httpOnly: true,
    maxAge: 31 * 24 * 60 * 60 * 1000, // 31 days in millseconds
    path: "/",
    secure: false,
  },
  name: "launch-school-todos-session-id",
  resave: false,
  saveUninitialized: true,
  secret: "this is not very secure",
  store: new LokiStore({}),
}));

app.use(flash());


// Set up persistent session data
let todoLists = [];
app.use((req, res, next) => {
  let arr = [];
  if ("todoLists" in req.session) {
    req.session.todoLists.forEach(todoList => {
      arr.push(TodoList.makeTodoList(todoList));
    });
  }
  todoLists = arr;
  req.session.todoLists = todoLists;
  next();
});

// Extract session info
app.use((req, res, next) => {
  res.locals.flash = req.session.flash;
  delete req.session.flash;
  next();
});

// Find a todo list with the indicated ID. Returns `undefined` if not found.
// Not that `todoListId` must be numeric.
const loadTodoList = todoListId => {
  return todoLists.find(todoList => todoList.id === todoListId);
}

// Toggle (mark done or undone) the todo from the given todo list.
// Add flahs messages when marking the todo as done or undone.
const toggleTodo = (todo, req) => {
  let title = todo.title;
  if (todo.isDone()) {
    todo.markUndone();
    req.flash("success", `"${title}" marked as NOT done!`);
  } else {
    todo.markDone();
    req.flash("success", `"${title}" marked done.`);
  }
}

const loadTodo = (listId, todoId) => {
  let todoList = loadTodoList(listId);
  if (!todoList) return undefined;
  return todoList.findById(todoId);
}

app.get("/", (req, res) => {
  res.redirect("lists");
});

// Render the list of todo lists
app.get("/lists", (req, res) => {
  res.render("lists", {
    todoLists: sortTodoLists(todoLists),
  });
});

// Render new todo list page
app.get("/lists/new", (req, res) => {
  res.render("new-list");
});

// Create a new todo list
app.post("/lists",
  [
    body("todoListTitle")
      .trim()
      .isLength({ min: 1 })
      .withMessage("The list title is required.")
      .isLength({ max: 100 })
      .withMessage("List title must be between 1 and 100 characters.")
      .custom(title => {
        let duplicate = todoLists.find(list => list.title === title);
        return duplicate === undefined;
      })
      .withMessage("List title must be unique."),
  ],
  (req, res) => {
    let errors = validationResult(req);
    if (!errors.isEmpty()) {
      errors.array().forEach(message => req.flash("error", message.msg));
      res.render("new-list", {
        flash: req.flash(),
        todoListTitle: req.body.todoListTitle,
      });
    } else {
      todoLists.push(new TodoList(req.body.todoListTitle));
      req.flash("success", "The todo list has been created.");
      res.redirect("/lists");
    }
  }
);

// Render individual todo list and its todos
app.get("/lists/:todoListId", (req, res, next) => {
  let todoListId = req.params.todoListId;
  let todoList = loadTodoList(+todoListId);

  if (todoList === undefined) {
    next(new Error("Not found."));
  } else {
    res.render("list", {
      todoList,
      todos: sortTodos(todoList),
    });
  }
});

// Render the editing page
app.get("/lists/:todoListId/edit", (req, res, next) => {
  let todoListId = req.params.todoListId;
  let todoList = loadTodoList(+todoListId);
  if (!todoList) {
    next(new Error("Not found."));
  } else {
    res.render("edit-list", {
      todoList,
    });
  }
});

// Add new todos to the list
app.post("/lists/:todoListId/todos", [
  body("todoTitle")
    .trim()
    .isLength({ min: 1 })
    .withMessage("The todo title is required.")
    .isLength({ max: 100 })
    .withMessage("Todo title must be between 1 and 100 characters."),
], (req, res, next) => {
  let errors = validationResult(req);
  let todoList = loadTodoList(+(req.params.todoListId));
  if (!todoList) {
    next(new Error("Not found."));
  } else {
    let todoTitle = req.body.todoTitle;
    if (errors.isEmpty()) {
      todoList.add(new Todo(todoTitle));
      req.flash("success", "Todo has been created.");
      res.redirect(`/lists/${req.params.todoListId}`);
    } else {
      errors.array().forEach(error => req.flash("error", error.msg));
      res.render(`list`, {
        todoList,
        todos: sortTodos(todoList),
        flash: req.flash(),
        todoTitle,
      });
    }
  }
});


// Toggle individual todos in a todo list
app.post("/lists/:todoListId/todos/:todoId/toggle", (req, res, next) => {
  let { todoListId, todoId} = { ...req.params };
  let todo = loadTodo(+todoListId, +todoId);
  if (todo === undefined) {
    next(new Error("Not found."));
  } else {
    toggleTodo(todo, req);
    res.redirect(`/lists/${todoListId}`);
  }
});

// Delete individual todos from todo list
app.post("/lists/:todoListId/todos/:todoId/destroy", (req, res, next) => {
  let { todoListId, todoId} = { ...req.params };
  let todo = loadTodo(+todoListId, +todoId);
  if (todo === undefined) {
    next(new Error("Not found."));
  } else {
    let todoList = loadTodoList(+todoListId);
    todoList.removeAt(todoList.findIndexOf(todo));

    req.flash("success", `The todo has been deleted.`);
    res.redirect(`/lists/${todoListId}`);
  }
});

// Mark all todos as done
app.post("/lists/:todoListId/complete_all", (req, res, next) => {
  let todoListId = req.params.todoListId;
  let todoList = loadTodoList(+todoListId);
  if (!todoList) {
    next(new Error("Not found."));
  } else {
    todoList.markAllDone();
    req.flash("success", "All todos have been marked as done.");
    res.redirect(`/lists/${todoListId}`);
  }
});

// Delete list of todos
app.post("/lists/:todoListId/destroy", (req, res, next) => {
  let todoListId = req.params.todoListId;
  let todoList = loadTodoList(+todoListId);
  if (!todoList) {
    next(new Error("Not found."));
  } else {
    todoLists.splice(todoLists.indexOf(todoList), 1);

    req.flash("success", "Todo list deleted.");
    res.redirect("/lists");
  }
});

app.post("/lists/:todoListId/edit", [
  body("todoListTitle")
    .trim()
    .isLength({ min: 1 })
    .withMessage("List title is required.")
    .isLength({ max: 100 })
    .withMessage("List title must be between 1 and 100 character.")
    .custom(title => {
      return todoLists.find(list => list.title === title) === undefined;
    })
    .withMessage("List title must be unique.")
], (req, res, next) => {
  let todoListId = req.params.todoListId;
  let todoList = loadTodoList(+todoListId);
  if (!todoList) {
    next(new Error("Not found."));
  } else {
    let errors = validationResult(req);
    let todoListTitle = req.body.todoListTitle;
    if (!errors.isEmpty()) {
      errors.array().forEach(message => req.flash("error", message.msg));
      res.render("edit-list", {
        flash: req.flash(),
        todoList,
        todoListTitle,
      });
    } else {
      todoList.setTitle(todoListTitle);
      req.flash("success", "Todo list updated.");
      res.redirect(`/lists/${todoListId}`);
    }
  }
});

// Error handler
app.use((err, req, res, _next) => {
  console.log(err);
  res.status(404).send(err.message);
});

app.listen(port, host, () => {
  console.log(`Todos is listening on port ${port} of ${host}`);
});