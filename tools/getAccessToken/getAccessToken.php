
<?php

require_once __DIR__ . '/../../vendor/autoload.php';
use League\CLImate\CLImate;
$climate = new CLImate();
require_once __DIR__ . '/../../modules/progress.php';


/**
 * @category  Social_Engineering
 * @package   FacebookToolkit++
 * @author    Wahyu Arif Purnomo <hi@warifp.co>
 * @copyright 2019 WARIFP
 * @license   MIT License <https://opensource.org/licenses/MIT>
 * @version   1.7
 * @link      https://github.com/warifp/FacebookToolkit
 * @since     15 June 2019
 */

$save_dir = "config/token.txt";
$graph_url = 'https://graph.facebook.com/v3.2/me?fields=id,name&access_token=';

$climate->br()->info('Use a token generated from Facebook Graph API Explorer or your Facebook App.');
$climate->br()->info('Recommended scopes for account info: public_profile, email, user_birthday.');

$input_token = $climate->br()->info()->input('Paste access token');
$raw_token = $input_token->prompt();
$token = trim($raw_token);

if ($token === '') {
    $climate->br()->error('Token is empty. Please run this tool again and paste a valid token.');
    exit;
}

$climate->br()->info('Validating access token with Graph API..');
echo "\n";
progress($progress);

$curl = curl_init();
curl_setopt($curl, CURLOPT_URL, $graph_url . urlencode($token));
curl_setopt($curl, CURLOPT_RETURNTRANSFER, 1);
$response = curl_exec($curl);
curl_close($curl);

$decode = json_decode($response);

if (isset($decode->error->message)) {
    $climate->br()->error('Token validation failed: ' . $decode->error->message);
    $climate->br()->info('Token was not saved.');
    exit;
}

if (empty($decode->id)) {
    $climate->br()->error('Token validation failed: no user id returned from Graph API.');
    $climate->br()->info('Token was not saved.');
    exit;
}

$save = fopen($save_dir, 'w');
fwrite($save, $token);
fclose($save);

$climate->br()->backgroundGreen()->out('Token valid and saved successfully.');
$climate->br()->info('Account: ' . $decode->name . ' (' . $decode->id . ')');
$climate->br()->shout('Saved in ' . $save_dir);
