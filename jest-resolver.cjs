module.exports = (request, options) => {
  // Resolve the import-only toolkit entry so Jest can apply its existing mock.
  if (request === '@actions/github') {
    return options.defaultResolver(request, {
      ...options,
      conditions: ['import', ...(options.conditions || []).filter(condition => condition !== 'require')],
    });
  }

  return options.defaultResolver(request, options);
};
