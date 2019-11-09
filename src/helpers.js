const validateArgFn = (input) => (input && input.trim() !== '')

const getArgFromCli = (cli, args, index, prompt, defaultValue = null, validateFn = validateArgFn) => {
  if (defaultValue) {
    prompt += '(optional) '
  }

  const val = args[index] || cli.prompt(prompt)

  if (typeof validateFn !== 'function') {
    cli.warn('Invalid validateFn supplied to getArg()')
    validateFn = validateArgFn
  }

  if (validateFn(val)) {
    return val
  } else if (!defaultValue) {
    cli.warn(`Invalid arg:`, index, prompt)
  }

  return defaultValue
}

const makeHelpers = (cli, args) => {
  return {
    getArg: (...getArgArgs) => getArgFromCli(cli, args, ...getArgArgs)
  }
}

module.exports = {
  makeHelpers
}
