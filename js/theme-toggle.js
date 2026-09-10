(function ()
{
    var root = document.documentElement;
    var button = document.getElementById('theme-toggle');
    var icon = button.querySelector('i');

    function setTheme(theme)
    {
        root.setAttribute('data-theme', theme);
        localStorage.setItem('theme', theme);
        icon.className = theme === 'light' ? 'fa-solid fa-sun' : 'fa-solid fa-moon';
    }

    setTheme(root.getAttribute('data-theme'));

    button.addEventListener('click', function ()
    {
        setTheme(root.getAttribute('data-theme') === 'light' ? 'dark' : 'light');
    });
})();
