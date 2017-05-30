<?php

// Uncomment for debugging purposes
//ini_set('display_errors', 1);
//error_reporting(E_ALL ^ E_NOTICE);

$response = new stdClass();
$dbhandle = new SQLite3("/var/www/db/havedane.net.sqlite3");
$configs = include("config.php");

if(!isset($_GET['alias']))
{
    die();
} //if

if($_GET['alias'] == "")
{
    $response->state = "newalias";
    $response->alias = substr(hash("sha256", rand().microtime().$configs['secret']), 0, 16);
    $stmt = $dbhandle->prepare("INSERT INTO tests (alias, firstreceived, do, dont, wrong) VALUES (:alias, 0, 0, 0, 0)");
    $stmt->bindValue(':alias', $response->alias);
    $stmt->execute();
} //if
elseif (ctype_alnum($_GET['alias']))
{
    $query = $dbhandle->prepare("SELECT * FROM tests WHERE alias = :alias");
    $query->bindValue(':alias', $_GET['alias']);
    $result = $query->execute();
    $row = $result->fetchArray();
    if ($row)
    {
        $response->state = "update";
        $response->hasdane = $row['do'];
        $response->hasnodane = $row['dont'];
        $response->haswrongdane = $row['wrong'];
        $oldTime = strtotime($row['firstreceived']);
        $curTime = time();
        if ($oldTime > 0 && $curTime - $oldTime > 15) // We allow for a 15 second delay between arriving emails
        {
            $response->timeout = true;
        } //if
        else
        {
            $response->timeout = false;
        } //else
    } //if
} //else

$responseJSON = JSON_encode($response);

echo $responseJSON;
?>
