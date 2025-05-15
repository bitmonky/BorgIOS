<?php
function checkAndInstallDependencies($dependencies) {
    foreach ($dependencies as $dependency) {
        if (!extension_loaded($dependency['name'])) {
            echo "{$dependency['name']} extension not found. Attempting to install...\n";
            if (strtoupper(substr(PHP_OS, 0, 3)) === 'WIN') {
                echo "Please install {$dependency['name']} manually on Windows.\n";
            } else {
                exec($dependency['install_command'], $output, $return_var);
                if ($return_var === 0) {
                    echo "{$dependency['name']} installed successfully.\n";
                } else {
                    echo "Failed to install {$dependency['name']}.\n";
                    return false;
                }
            }
        } else {
            echo "{$dependency['name']} is already installed.\n";
        }
    }
    return true;
}

$dependencies = [
    ['name' => 'curl', 'install_command' => 'sudo apt-get install php-curl -y'],
    ['name' => 'pdo', 'install_command' => 'sudo apt-get install php-mysql -y']
    // Add other dependencies here
];

if (checkAndInstallDependencies($dependencies)) {
    // Continue with the rest of your PHP code
    echo "All dependencies are met. Executing the rest of the code...\n";

    // Your PHP code here
} else {
    echo "Dependencies check failed. Please install the required extensions manually.\n";
}
?>

