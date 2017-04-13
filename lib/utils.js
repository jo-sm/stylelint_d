var separator = 'stylelint_d_separator';

function generateError(message) {
  var prefix = 'Could not lint file';

  if (message) {
    message = `${prefix}: ${message}`;
  } else {
    message = prefix;
  }

  return [{
    deprecations: [],
    invalidOptionWarnings: [],
    warnings: [{
      line: 0,
      column: 0,
      rule: 'could-not-lint',
      severity: 'error',
      text: message
    }]
  }];
}

module.exports = {
  separator: separator,
  generateError: generateError
}