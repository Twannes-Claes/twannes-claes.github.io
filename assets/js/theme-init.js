(function ()
{
    var stored = localStorage.getItem('theme');
    var systemPrefersLight = window.matchMedia('(prefers-color-scheme: light)').matches;
    var theme = stored || (systemPrefersLight ? 'light' : 'dark');
    document.documentElement.setAttribute('data-theme', theme);
})();
