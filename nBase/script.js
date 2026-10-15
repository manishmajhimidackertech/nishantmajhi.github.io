document.addEventListener("DOMContentLoaded", () => {
  const firstNum = document.getElementById("first_num");
  const secondNum = document.getElementById("second_num");
  const operations = document.getElementById("operations");

  const elements = {
    firstSelect: firstNum.querySelector("select"),
    firstInput: firstNum.querySelector("input"),
    secondSelect: secondNum.querySelector("select"),
    secondInput: secondNum.querySelector("input"),
    resultSelect: operations.querySelector("select"),
    buttons: operations.querySelectorAll("button"),
    output: document.querySelector("output"),
  };

  let base1 = 10;
  let base2 = 10;
  let resultBase = 10;
  let lastOperator = null;

  function updateFirstBase() {
    base1 = parseInt(elements.firstSelect.value);
  }

  function updateSecondBase() {
    base2 = parseInt(elements.secondSelect.value);
  }

  function updateResultBase() {
    resultBase = parseInt(elements.resultSelect.value);
    if (lastOperator !== null) {
      calculate(lastOperator);
    }
  }

  function updatePattern() {
    updateFirstBase();
    setPattern(elements.firstInput, base1);
    updateSecondBase();
    setPattern(elements.secondInput, base2);
    if (lastOperator !== null) {
      calculate(lastOperator);
    }
  }

  function setPattern(input, base) {
    let pattern = "";
    let title = "";

    switch (base) {
      case 2:
        pattern = "[01]+";
        title = "Only 0 and 1 allowed";
        break;
      case 5:
        pattern = "[0-4]+";
        title = "Only digits 0–4 allowed";
        break;
      case 8:
        pattern = "[0-7]+";
        title = "Only digits 0–7 allowed";
        break;
      case 10:
        pattern = "[0-9]+";
        title = "Only digits 0–9 allowed";
        break;
      case 16:
        pattern = "[0-9A-Fa-f]+";
        title = "Digits 0–9 and letters A–F allowed";
        break;
      default:
        break;
    }

    input.pattern = pattern;
    input.title = title;
  }

  function calculate(operator) {
    const firstInput = elements.firstInput.value.trim();
    const secondInput = elements.secondInput.value.trim();

    const num1 = parseInBase(firstInput, base1);
    const num2 = parseInBase(secondInput, base2);

    if (num1 === null || num2 === null) {
      elements.output.textContent = "Invalid input!";
      lastOperator = null;
      return;
    }

    lastOperator = operator;

    let result;
    let resultHTML = "";

    switch (operator) {
      case "+":
        result = num1 + num2;
        resultHTML = `(${firstInput})<sub>${base1}</sub>&nbsp;+&nbsp;(${secondInput})<sub>${base2}</sub>&nbsp;=&nbsp;(${result.toString(
          resultBase
        )})<sub>${resultBase}</sub>`;
        break;
      case "-":
        result = num1 - num2;
        resultHTML = `(${firstInput})<sub>${base1}</sub>&nbsp;-&nbsp;(${secondInput})<sub>${base2}</sub>&nbsp;=&nbsp;(${result.toString(
          resultBase
        )})<sub>${resultBase}</sub>`;
        break;
      case "*":
        result = num1 * num2;
        resultHTML = `(${firstInput})<sub>${base1}</sub>&nbsp;×&nbsp;(${secondInput})<sub>${base2}</sub>&nbsp;=&nbsp;(${result.toString(
          resultBase
        )})<sub>${resultBase}</sub>`;
        break;
      case "/":
        if (num2 === 0n) {
          elements.output.textContent = "Division by zero!";
          lastOperator = null;
          return;
        }
        const quotient = num1 / num2;
        const remainder = num1 % num2;
        resultHTML = `Quotient&nbsp;=&nbsp;(${quotient.toString(
          resultBase
        )})<sub>${resultBase}</sub>
                    <br>
                    Remainder&nbsp;=&nbsp;(${remainder.toString(
                      resultBase
                    )})<sub>${resultBase}</sub>`;
        break;
      default:
        elements.output.textContent = "Unknown operation";
        lastOperator = null;
        return;
    }

    elements.output.innerHTML = resultHTML;
  }

  elements.firstSelect.addEventListener("change", updatePattern);
  elements.secondSelect.addEventListener("change", updatePattern);
  elements.resultSelect.addEventListener("change", updateResultBase);

  elements.buttons.forEach((button) => {
    button.addEventListener("click", () => {
      const operator = button.getAttribute("data-operator");
      calculate(operator);
    });
  });

  updatePattern();
});

// The value of `text` read as a number in `base`, or null unless every
// character is a digit of that base -- the same rule as the inputs' pattern
// attributes, which nothing else enforces. BigInt, because the inputs take 24
// digits and a double holds about 16.
function parseInBase(text, base) {
  const digits = "0123456789abcdef".slice(0, base);
  const str = String(text).trim().toLowerCase();
  if (!str) return null;
  let value = 0n;
  for (const ch of str) {
    const digit = digits.indexOf(ch);
    if (digit < 0) return null;
    value = value * BigInt(base) + BigInt(digit);
  }
  return value;
}
