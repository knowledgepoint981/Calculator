(() => {
  "use strict";
  const $ = (selector) => document.querySelector(selector);
  const expressionInput = $("#expression");
  const answerOutput = $("#answer");
  const errorMessage = $("#errorMessage");
  const stepsList = $("#stepsList");
  const stepsIntro = $("#stepsIntro");
  const historyList = $("#historyList");
  const emptyHistory = $("#emptyHistory");
  let angleMode = "DEG";
  let lastAnswer = 0;
  let lastSteps = [];
  let history = readHistory();

  function readHistory() {
    try { return JSON.parse(localStorage.getItem("kpehMathHistory") || "[]"); }
    catch { return []; }
  }
  function format(n) {
    if (!Number.isFinite(n)) throw new Error("The result is not a finite number.");
    if (Math.abs(n) < 1e-12) n = 0;
    return Number(n.toPrecision(12)).toString();
  }
  function factorial(n) {
    if (n < 0 || !Number.isInteger(n)) throw new Error("Factorial needs a non-negative whole number.");
    if (n > 170) throw new Error("That factorial is too large to calculate safely.");
    let result = 1;
    for (let i = 2; i <= n; i++) result *= i;
    return result;
  }
  function tokenize(source) {
    const s = source.replace(/×/g, "*").replace(/÷/g, "/").replace(/−/g, "-").replace(/\s+/g, "");
    const tokens = [];
    let i = 0;
    while (i < s.length) {
      const rest = s.slice(i);
      const num = rest.match(/^(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?/i);
      const name = rest.match(/^[a-zA-Z]+/);
      if (num) { tokens.push({type:"number", value:Number(num[0]), raw:num[0]}); i += num[0].length; }
      else if (name) { tokens.push({type:"name", value:name[0].toLowerCase()}); i += name[0].length; }
      else if ("+-*/^!%()".includes(s[i])) { tokens.push({type:s[i], value:s[i]}); i++; }
      else throw new Error(`I don't recognize "${s[i]}".`);
    }
    // Insert multiplication for common forms such as 2pi, 3(4+1), (2)(3), and 2sqrt(9).
    const out = [];
    const ends = (t) => t && (t.type === "number" || t.type === ")" || t.type === "!" || t.type === "%" || (t.type === "name" && ["pi","e","ans"].includes(t.value)));
    const starts = (t) => t && (t.type === "number" || t.type === "(" || t.type === "name");
    for (const t of tokens) {
      const prev = out[out.length - 1];
      if (ends(prev) && starts(t)) out.push({type:"*", value:"*"});
      out.push(t);
    }
    return out;
  }

  function solve(source) {
    const tokens = tokenize(source);
    let pos = 0;
    const steps = [];
    const peek = () => tokens[pos];
    const take = () => tokens[pos++];
    const addStep = (text) => steps.push(text);
    const expect = (type) => {
      if (!peek() || peek().type !== type) throw new Error(`Expected "${type}".`);
      return take();
    };
    function primary() {
      const t = take();
      if (!t) throw new Error("Please enter a maths expression.");
      if (t.type === "number") return t.value;
      if (t.type === "(") {
        const v = expression();
        expect(")");
        return v;
      }
      if (t.type === "name") {
        if (t.value === "pi") return Math.PI;
        if (t.value === "e") return Math.E;
        if (t.value === "ans") return lastAnswer;
        const fn = t.value;
        expect("(");
        const x = expression();
        expect(")");
        let v;
        const a = angleMode === "DEG" ? x * Math.PI / 180 : x;
        switch (fn) {
          case "sin": v = Math.sin(a); break;
          case "cos": v = Math.cos(a); break;
          case "tan": v = Math.tan(a); break;
          case "asin": v = Math.asin(x); if (angleMode === "DEG") v *= 180 / Math.PI; break;
          case "acos": v = Math.acos(x); if (angleMode === "DEG") v *= 180 / Math.PI; break;
          case "atan": v = Math.atan(x); if (angleMode === "DEG") v *= 180 / Math.PI; break;
          case "sqrt": if (x < 0) throw new Error("Square root of a negative number is not real."); v = Math.sqrt(x); break;
          case "cbrt": v = Math.cbrt(x); break;
          case "log": if (x <= 0) throw new Error("log needs a positive number."); v = Math.log10(x); break;
          case "ln": if (x <= 0) throw new Error("ln needs a positive number."); v = Math.log(x); break;
          case "abs": v = Math.abs(x); break;
          case "exp": v = Math.exp(x); break;
          case "inv": if (x === 0) throw new Error("Cannot divide by zero."); v = 1 / x; break;
          default: throw new Error(`Unknown function or constant: ${fn}.`);
        }
        addStep(`${fn}(${format(x)}) = ${format(v)}${["sin","cos","tan","asin","acos","atan"].includes(fn) ? ` (${angleMode})` : ""}`);
        return v;
      }
      throw new Error("Check the expression and brackets.");
    }
    function postfix() {
      let v = primary();
      while (peek() && (peek().type === "!" || peek().type === "%")) {
        const op = take().type, before = v;
        if (op === "!") v = factorial(v);
        else v = v / 100;
        addStep(op === "!" ? `${format(before)}! = ${format(v)}` : `${format(before)}% = ${format(v)}`);
      }
      return v;
    }
    function power() {
      let v = postfix();
      if (peek() && peek().type === "^") {
        take();
        const right = unary();
        const before = v;
        v = Math.pow(v, right);
        addStep(`${format(before)} ^ ${format(right)} = ${format(v)}`);
      }
      return v;
    }
    function unary() {
      if (peek() && peek().type === "+") { take(); return unary(); }
      if (peek() && peek().type === "-") { take(); return -unary(); }
      return power();
    }
    function multiplicative() {
      let v = unary();
      while (peek() && (peek().type === "*" || peek().type === "/")) {
        const op = take().type, right = unary(), before = v;
        if (op === "/" && right === 0) throw new Error("Cannot divide by zero.");
        v = op === "*" ? v * right : v / right;
        addStep(`${format(before)} ${op === "*" ? "×" : "÷"} ${format(right)} = ${format(v)}`);
      }
      return v;
    }
    function expression() {
      let v = multiplicative();
      while (peek() && (peek().type === "+" || peek().type === "-")) {
        const op = take().type, right = multiplicative(), before = v;
        v = op === "+" ? v + right : v - right;
        addStep(`${format(before)} ${op} ${format(right)} = ${format(v)}`);
      }
      return v;
    }
    if (!tokens.length) throw new Error("Please enter a maths expression.");
    const result = expression();
    if (pos !== tokens.length) throw new Error("Please check the expression near the end.");
    if (!Number.isFinite(result)) throw new Error("The result is too large or undefined.");
    if (!steps.length) addStep(`The value is ${format(result)}.`);
    return {result, steps};
  }

  function showSteps(steps, result) {
    stepsList.replaceChildren();
    stepsIntro.textContent = "Work through the operations below. Operations are shown in the order they were evaluated.";
    steps.forEach((step, index) => {
      const li = document.createElement("li");
      li.textContent = step;
      if (index === steps.length - 1) li.classList.add("final-step");
      stepsList.appendChild(li);
    });
    const li = document.createElement("li");
    li.className = "final-step";
    li.textContent = `Final answer = ${format(result)}`;
    stepsList.appendChild(li);
  }
  function calculate() {
    errorMessage.textContent = "";
    try {
      const {result, steps} = solve(expressionInput.value);
      lastAnswer = result;
      lastSteps = steps;
      answerOutput.textContent = format(result);
      showSteps(steps, result);
    } catch (err) {
      errorMessage.textContent = err.message || "Could not calculate that expression.";
      answerOutput.textContent = "—";
      stepsIntro.textContent = "Fix the expression, then calculate again.";
      stepsList.replaceChildren();
    }
  }
  function renderHistory() {
    historyList.replaceChildren();
    emptyHistory.classList.toggle("hidden", history.length > 0);
    history.forEach((item, index) => {
      const li = document.createElement("li");
      const info = document.createElement("div");
      info.className = "history-entry";
      const expr = document.createElement("div");
      expr.className = "history-expression";
      expr.textContent = item.expression;
      const result = document.createElement("div");
      result.className = "history-result";
      result.textContent = `= ${item.result}`;
      info.append(expr, result);
      const use = document.createElement("button");
      use.className = "history-use";
      use.type = "button";
      use.textContent = "Use again";
      use.addEventListener("click", () => {
        expressionInput.value = item.expression;
        document.querySelector('[data-tab="basic"]').click();
        calculate();
      });
      li.append(info, use);
      historyList.appendChild(li);
    });
  }
  function saveHistory() {
    if (!expressionInput.value.trim() || answerOutput.textContent === "—") return;
    history.unshift({expression: expressionInput.value, result: answerOutput.textContent, at: Date.now()});
    history = history.slice(0, 40);
    try { localStorage.setItem("kpehMathHistory", JSON.stringify(history)); } catch {}
    renderHistory();
  }
  function insertAtCursor(value) {
    const start = expressionInput.selectionStart ?? expressionInput.value.length;
    const end = expressionInput.selectionEnd ?? expressionInput.value.length;
    expressionInput.setRangeText(value, start, end, "end");
    expressionInput.focus();
  }
  document.querySelectorAll("[data-insert]").forEach(btn => btn.addEventListener("click", () => insertAtCursor(btn.dataset.insert)));
  document.querySelectorAll('[data-action="calculate"]').forEach(btn => btn.addEventListener("click", calculate));
  document.querySelectorAll('[data-action="clear"]').forEach(btn => btn.addEventListener("click", () => {
    expressionInput.value = ""; answerOutput.textContent = "0"; errorMessage.textContent = "";
    stepsList.replaceChildren(); stepsIntro.textContent = "Enter a maths expression and press Calculate to see the working.";
    expressionInput.focus();
  }));
  document.querySelectorAll('[data-action="delete"]').forEach(btn => btn.addEventListener("click", () => {
    const s = expressionInput.selectionStart ?? expressionInput.value.length;
    const e = expressionInput.selectionEnd ?? s;
    if (s !== e) expressionInput.setRangeText("", s, e, "end");
    else if (s > 0) expressionInput.setRangeText("", s - 1, s, "end");
    expressionInput.focus();
  }));
  expressionInput.addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); calculate(); } });
  $("#degBtn").addEventListener("click", () => { angleMode = "DEG"; $("#degBtn").classList.add("active"); $("#radBtn").classList.remove("active"); });
  $("#radBtn").addEventListener("click", () => { angleMode = "RAD"; $("#radBtn").classList.add("active"); $("#degBtn").classList.remove("active"); });
  document.querySelectorAll("[data-tab]").forEach(btn => btn.addEventListener("click", () => {
    document.querySelectorAll("[data-tab]").forEach(t => t.classList.toggle("active", t === btn));
    const tab = btn.dataset.tab;
    $("#calculatorPanel").classList.toggle("hidden", tab === "history");
    $("#historyPanel").classList.toggle("hidden", tab !== "history");
    $("#basicKeys").classList.toggle("hidden", tab === "history" || tab === "scientific");
    $("#scientificKeys").classList.toggle("hidden", tab !== "scientific");
  }));
  $("#themeToggle").addEventListener("click", () => {
    document.body.classList.toggle("light");
    $("#themeToggle").textContent = document.body.classList.contains("light") ? "☾ Dark mode" : "☀ Light mode";
  });
  $("#copyAnswer").addEventListener("click", async () => {
    try { await navigator.clipboard.writeText(answerOutput.textContent); $("#copyAnswer").textContent = "Copied!"; }
    catch { errorMessage.textContent = "Copy is unavailable in this browser. Select the answer and copy it manually."; }
    setTimeout(() => { $("#copyAnswer").textContent = "Copy answer"; }, 1300);
  });
  $("#saveHistory").addEventListener("click", saveHistory);
  $("#clearHistory").addEventListener("click", () => {
    history = [];
    try { localStorage.removeItem("kpehMathHistory"); } catch {}
    renderHistory();
  });
  renderHistory();
  console.log("Knowledge Point EduHub calculator with maths steps loaded.");
})();